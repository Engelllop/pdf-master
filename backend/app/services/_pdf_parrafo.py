"""Reacomodo de un párrafo con estilos mezclados (negrita, color o cuerpo por tramo).

El usuario edita texto plano; para que cada tramo conserve su estilo se compara el texto
nuevo con el original carácter a carácter: lo que sigue igual conserva su estilo y lo que
se escribe toma el del carácter anterior (como en Word: escribir al final de una palabra
en negrita sigue en negrita). Después se corta en renglones al ancho del párrafo.

Todo acá es lógica pura (sin PyMuPDF): la medida de cada pieza llega como función.
"""
from __future__ import annotations

import difflib
from dataclasses import dataclass
from typing import Callable, List, Optional, Sequence, Tuple

Pieza = Tuple[str, int]  # (texto, índice del tramo cuyo estilo lleva)
Token = Tuple[str, List[Pieza]]  # ("w" palabra | "sp" espacios | "nl" salto, piezas)

# Por encima de esto la comparación carácter a carácter se vuelve lenta; se escribe con
# un solo estilo (el llamador cae al camino de siempre).
MAX_CARACTERES = 20000
TABULADOR = "    "


def estilos_por_caracter(base: str, runs: Sequence[dict], nuevo: str) -> Optional[List[int]]:
    """Índice de tramo de cada carácter de `nuevo`, o None si los tramos no describen
    `base` (entonces no hay forma de saber qué estilo conservar)."""
    n = len(base)
    if not runs or not base or n > MAX_CARACTERES or len(nuevo) > MAX_CARACTERES:
        return None
    de_base = [-1] * n
    for idx, r in enumerate(runs):
        ini, fin = int(r["start"]), int(r["end"])
        if not 0 <= ini < fin <= n:
            return None
        for i in range(ini, fin):
            de_base[i] = idx
    if -1 in de_base:  # hueco entre tramos: toma el del carácter anterior (o el siguiente)
        previo = next((v for v in de_base if v != -1), 0)
        for i, v in enumerate(de_base):
            if v == -1:
                de_base[i] = previo
            else:
                previo = v
    if not nuevo:
        return []

    res = [de_base[0]] * len(nuevo)
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, base, nuevo, autojunk=False).get_opcodes():
        if tag == "equal":
            res[j1:j2] = de_base[i1:i2]
        elif tag == "replace":
            # Uno a uno hasta donde alcance lo reemplazado; lo que sobra lleva el último.
            for k in range(j2 - j1):
                res[j1 + k] = de_base[i1 + min(k, i2 - i1 - 1)]
        elif tag == "insert":
            res[j1:j2] = [de_base[i1 - 1] if i1 > 0 else de_base[min(i1, n - 1)]] * (j2 - j1)
    return res


def tokenizar(texto: str, estilos: Sequence[int]) -> List[Token]:
    """Palabras, espacios y saltos de línea, cada uno con sus piezas por estilo."""
    tokens: List[Token] = []
    n = len(texto)
    i = 0
    while i < n:
        ch = texto[i]
        if ch == "\n":
            tokens.append(("nl", []))
            i += 1
            continue
        espacio = ch in " \t"
        j = i
        while j < n and texto[j] != "\n" and ((texto[j] in " \t") == espacio):
            j += 1
        piezas: List[Pieza] = []
        for k in range(i, j):
            c = TABULADOR if texto[k] == "\t" else texto[k]
            if piezas and piezas[-1][1] == estilos[k]:
                piezas[-1] = (piezas[-1][0] + c, estilos[k])
            else:
                piezas.append((c, estilos[k]))
        tokens.append(("sp" if espacio else "w", piezas))
        i = j
    return tokens


@dataclass
class Linea:
    piezas: List[Pieza]
    ancho: float
    espacios: int
    dura: bool  # terminó en un salto del autor o es la última: no se justifica


def componer(tokens: Sequence[Token], medir: Callable[[str, int], float],
             ancho_primera: float, ancho_resto: float) -> List[Linea]:
    """Parte los tokens en renglones al ancho dado. Una palabra más larga que el
    renglón se deja entera (desborda) en vez de partirla."""
    lineas: List[Linea] = []
    piezas: List[Pieza] = []
    ancho = 0.0
    hay_palabra = False
    inicio_duro = True  # al principio y tras un salto del autor se conservan los espacios

    def anchos(ps) -> float:
        return sum(medir(t, s) for t, s in ps)

    def cerrar(dura: bool):
        nonlocal piezas, ancho, hay_palabra, inicio_duro
        while piezas and not piezas[-1][0].strip():  # los espacios del final no cuentan
            ancho -= medir(*piezas[-1])
            piezas.pop()
        lineas.append(Linea(piezas, max(ancho, 0.0), sum(t.count(" ") for t, _ in piezas), dura))
        piezas, ancho, hay_palabra, inicio_duro = [], 0.0, False, dura

    for tipo, ps in tokens:
        if tipo == "nl":
            cerrar(True)
            continue
        w = anchos(ps)
        if tipo == "sp":
            if hay_palabra or inicio_duro:
                piezas.extend(ps)
                ancho += w
            continue
        limite = ancho_primera if not lineas else ancho_resto
        if hay_palabra and ancho + w > limite + 1e-6:
            cerrar(False)
        piezas.extend(ps)
        ancho += w
        hay_palabra = True
    cerrar(True)
    return lineas

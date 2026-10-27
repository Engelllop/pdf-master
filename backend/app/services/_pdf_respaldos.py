"""Respaldo del original antes de guardar encima, FUERA de la carpeta del plano.

Antes cada Ctrl+S copiaba el archivo a `nombre.pdf.bak` al lado del original: los
`.bak` quedaban en la carpeta del proyecto (la que se comparte y se entrega) y cada
guardado pisaba el anterior, así que a partir del segundo el `.bak` ya no era el
original — justo lo que tenía que proteger.

Ahora la copia va a la carpeta de respaldos de la app, una por archivo y por DÍA: la
primera vez que se guarda un archivo en el día queda su versión de antes, y los
guardados siguientes de ese día no la tocan. Las carpetas viejas se podan solas.
"""
import hashlib
import logging
import os
import shutil
from datetime import date, datetime, timedelta
from typing import Optional

logger = logging.getLogger("pdfmaster")

DIAS_QUE_SE_GUARDAN = 30
# Tope de espacio: un juego de 60 planos de 50 MB son 3 GB por día de trabajo.
TOPE_BYTES = 5 * 1024 ** 3


def carpeta_respaldos() -> str:
    """La carpeta de respaldos. Electron la pasa en PDFMASTER_RESPALDOS (bajo
    LOCALAPPDATA: no conviene que gigas de planos viajen en el perfil móvil); a mano,
    la misma ruta calculada aquí."""
    ruta = os.environ.get("PDFMASTER_RESPALDOS", "").strip()
    if ruta:
        return ruta
    base = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), ".pdfmaster")
    return os.path.join(base, "PDF Master", "respaldos")


def nombre_respaldo(ruta_original: str) -> str:
    """`nombre [a1b2c3d4].pdf`: el hash de la ruta completa distingue dos «A-101.pdf»
    de carpetas distintas sin meter la ruta entera en el nombre."""
    completa = os.path.normcase(os.path.abspath(ruta_original))
    corto = hashlib.sha1(completa.encode("utf-8", "surrogatepass")).hexdigest()[:8]
    base, ext = os.path.splitext(os.path.basename(ruta_original))
    return f"{base} [{corto}]{ext}"


def respaldar_original(ruta_original: str, hoy: Optional[date] = None) -> Optional[str]:
    """Copia `ruta_original` a la carpeta del día si todavía no hay copia de hoy.
    Devuelve la ruta del respaldo (nueva o la que ya estaba). Lanza si no pudo copiar:
    quien guarda decide qué hacer (hoy: guardar igual y avisar)."""
    if not os.path.exists(ruta_original):
        return None
    hoy = hoy or date.today()
    raiz = carpeta_respaldos()
    dia = os.path.join(raiz, hoy.isoformat())
    os.makedirs(dia, exist_ok=True)
    destino = os.path.join(dia, nombre_respaldo(ruta_original))
    if not os.path.exists(destino):
        # Copia a temporal y renombra: un respaldo a medias que «ya existe» haría que
        # el día siguiente se saltara sin tener el original de verdad.
        temporal = destino + ".tmp"
        shutil.copy2(ruta_original, temporal)
        os.replace(temporal, destino)
        try:
            with open(os.path.join(dia, "indice.txt"), "a", encoding="utf-8") as f:
                f.write(f"{datetime.now():%H:%M}\t{os.path.basename(destino)}\t{os.path.abspath(ruta_original)}\n")
        except OSError:
            logger.warning("No se pudo anotar el respaldo en el índice de %s", dia, exc_info=True)
        try:
            podar(raiz, hoy)
        except Exception:
            logger.warning("No se pudieron podar los respaldos viejos de %s", raiz, exc_info=True)
    return destino


def _peso(carpeta: str) -> int:
    total = 0
    for actual, _, archivos in os.walk(carpeta):
        for a in archivos:
            try:
                total += os.path.getsize(os.path.join(actual, a))
            except OSError:
                pass
    return total


def podar(raiz: str, hoy: Optional[date] = None, dias: int = DIAS_QUE_SE_GUARDAN, tope: int = TOPE_BYTES) -> int:
    """Borra los días de más de `dias` y, si se pasa del tope, los más viejos hasta
    entrar. Nunca el de hoy. Solo toca carpetas con nombre de fecha. Devuelve cuántas
    borró."""
    hoy = hoy or date.today()
    if not os.path.isdir(raiz):
        return 0
    dias_guardados = []
    for nombre in os.listdir(raiz):
        try:
            fecha = date.fromisoformat(nombre)
        except ValueError:
            continue
        if os.path.isdir(os.path.join(raiz, nombre)):
            dias_guardados.append((fecha, nombre))
    dias_guardados.sort()
    borradas = 0
    limite = hoy - timedelta(days=dias)
    for fecha, nombre in list(dias_guardados):
        if fecha < limite:
            shutil.rmtree(os.path.join(raiz, nombre), ignore_errors=True)
            dias_guardados.remove((fecha, nombre))
            borradas += 1
    pesos = {nombre: _peso(os.path.join(raiz, nombre)) for _, nombre in dias_guardados}
    total = sum(pesos.values())
    for fecha, nombre in dias_guardados:
        if total <= tope or fecha >= hoy:
            break
        shutil.rmtree(os.path.join(raiz, nombre), ignore_errors=True)
        total -= pesos[nombre]
        borradas += 1
    return borradas

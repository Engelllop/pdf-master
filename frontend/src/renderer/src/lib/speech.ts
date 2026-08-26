// Lectura en voz alta. Vive aparte del Toolbar porque el troceo tiene reglas propias
// y es lo único de aquí que se puede probar sin un motor de voz de verdad.

// Chromium corta una utterance larga a los ~15 segundos: una página entera de texto
// se quedaba muda a media lectura. Se trocea en frases y se encolan varias cortas.
export function trocearParaVoz(texto: string, max = 220): string[] {
  const frases = texto.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*\s*/g) ?? []
  const trozos: string[] = []
  let actual = ''
  for (const frase of frases) {
    for (const parte of frase.length > max ? partirLargo(frase, max) : [frase]) {
      if (actual.length + parte.length > max && actual.trim()) { trozos.push(actual.trim()); actual = '' }
      actual += parte
    }
  }
  if (actual.trim()) trozos.push(actual.trim())
  return trozos
}

// Una frase sin puntuación más larga que el tope (títulos, tablas de un plano) se
// parte por palabras para no volver a caer en el corte de Chromium.
function partirLargo(frase: string, max: number): string[] {
  const partes: string[] = []
  let actual = ''
  for (const palabra of frase.split(' ')) {
    if (actual.length + palabra.length + 1 > max && actual) { partes.push(actual + ' '); actual = '' }
    actual += (actual ? ' ' : '') + palabra
  }
  if (actual) partes.push(actual)
  return partes
}

export function detenerLectura(): void {
  window.speechSynthesis?.cancel()
}

// Encola el texto troceado. `onFin` corre al terminar el último trozo, no en cada uno,
// y también si el motor de voz falla — si no, el botón se quedaba en «Detener» para
// siempre con la app en silencio.
export function leerEnVozAlta(texto: string, onFin: () => void): void {
  const trozos = trocearParaVoz(texto)
  if (!trozos.length) { onFin(); return }
  window.speechSynthesis.cancel()
  trozos.forEach((trozo, i) => {
    const u = new SpeechSynthesisUtterance(trozo)
    u.lang = navigator.language || 'es'
    if (i === trozos.length - 1) u.onend = onFin
    u.onerror = onFin
    window.speechSynthesis.speak(u)
  })
}

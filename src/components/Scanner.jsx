import { useEffect, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import { numberField } from '../lib/fields.js'

export default function Scanner({ onResult, onClose }) {
  const videoRef = useRef(null); const controls = useRef(null)
  const [error, setError] = useState(''); const [manual, setManual] = useState('')
  useEffect(() => {
    let alive = true
    import('@zxing/browser').then(async ({ BrowserMultiFormatReader }) => {
      try {
        const reader = new BrowserMultiFormatReader()
        controls.current = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, videoRef.current, result => {
          if (result && alive) { controls.current?.stop(); onResult(result.getText()) }
        })
      } catch { if (alive) setError(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'No hemos podido abrir la cámara. Escribe el código a mano.' : 'La cámara necesita HTTPS. Abre la app por su dirección https y vuelve a intentarlo.') }
    }).catch(() => { if (alive) setError('No hemos podido cargar el escáner. Escribe el código a mano.') })
    return () => { alive = false; controls.current?.stop() }
  }, [onResult])
  const submit = event => { event.preventDefault(); const code = manual.trim(); if (/^[0-9]{6,14}$/.test(code)) onResult(code) }
  return <Modal title="Escanear código" onClose={onClose}>
    <video className="scanner" ref={videoRef} muted playsInline />
    <p className="muted">Apunta al código de barras del producto.</p>
    {error && <p className="error">{error}</p>}
    <form className="search-row" onSubmit={submit}>
      <input {...numberField('ean_manual', { inputMode: 'numeric', pattern: '[0-9]*' })} value={manual} onChange={event => setManual(event.target.value)} placeholder="O escribe el código" enterKeyHint="search" />
      <button disabled={!/^[0-9]{6,14}$/.test(manual.trim())}>Buscar</button>
    </form>
  </Modal>
}

import { useEffect, useRef, useState } from 'react'
import Modal from './Modal.jsx'

export default function Scanner({ onResult, onClose }) {
  const videoRef = useRef(null); const controls = useRef(null); const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    import('@zxing/browser').then(async ({ BrowserMultiFormatReader }) => {
      try {
        const reader = new BrowserMultiFormatReader()
        controls.current = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, videoRef.current, result => {
          if (result && alive) { controls.current?.stop(); onResult(result.getText()) }
        })
      } catch { if (alive) setError('No hemos podido abrir la cámara. Puedes escribir el código manualmente.') }
    })
    return () => { alive = false; controls.current?.stop() }
  }, [onResult])
  return <Modal title="Escanear código" onClose={onClose}><video className="scanner" ref={videoRef} muted playsInline /><p className="muted">Apunta al código de barras o QR.</p>{error && <p className="error">{error}</p>}<button className="secondary full" onClick={onClose}>Introducir manualmente</button></Modal>
}

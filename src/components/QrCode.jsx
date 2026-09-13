import { useEffect, useState } from 'react'

export default function QrCode({ foodId }) {
  const [url, setUrl] = useState('')
  useEffect(() => { import('qrcode').then(({ toDataURL }) => toDataURL(`nutri-diary:food:${foodId}`, { margin: 1, width: 180 }).then(setUrl)) }, [foodId])
  return url ? <img className="qr" src={url} alt="QR privado del alimento" /> : <span className="muted">Generando QR…</span>
}

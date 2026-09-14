const paths = {
  // Echoes the app icon: a bowl with a strand of noodles over it.
  hoy: <>
    <path d="M3.2 11.5h17.6c0 4.7-3.9 8-8.8 8s-8.8-3.3-8.8-8Z" />
    <path d="M6.3 7.9c1.4-1.6 2.9-1.6 4.3 0s2.9 1.6 4.3 0" />
  </>,
  alimentos: <>
    <path d="M12 9.9C11 8.9 10 8.4 8.9 8.4 6.7 8.4 5 10.4 5 13.4c0 3.8 2.5 7.1 4.5 7.1.8 0 1.5-.4 2.5-.4s1.7.4 2.5.4c2 0 4.5-3.3 4.5-7.1 0-3-1.7-5-3.9-5-1.1 0-2.1.5-3.1 1.5Z" />
    <path d="M12 9.9V7.3" />
    <path d="M12.2 7.4c.7-1.5 2.2-2.1 3.3-2 .1 1.1-.4 2.6-1.9 3-.8.2-1.4-.3-1.4-1Z" />
  </>,
  progreso: <>
    <path d="M5 19.5v-5.2" />
    <path d="M11.7 19.5V8.1" />
    <path d="M18.4 19.5v-8" />
  </>,
  perfil: <>
    <path d="M12 11.6a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z" />
    <path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0" />
  </>,
}

export default function Icon({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

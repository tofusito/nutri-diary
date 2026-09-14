import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <main><section className="chart-card" role="alert">
      <h1>No hemos podido mostrar esta pantalla</h1>
      <p className="muted">Puedes volver a abrirla. Los cambios sin guardar podrían perderse.</p>
      <button onClick={() => this.setState({ failed: false })}>Volver a intentar</button>
      <button className="link-button" onClick={() => window.location.reload()}>Recargar el diario</button>
    </section></main>
  }
}

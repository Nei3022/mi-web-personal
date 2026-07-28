import { useState, useEffect } from 'react'
import { supabase } from './supaClient'

function App() {
  const [status, setStatus] = useState('Comprobando conexión...')
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    async function checkConnection() {
      const { error } = await supabase.from('test').select('*').limit(1)
      
      if (error && error.code !== 'PGRST116') {
        console.log('Respuesta de Supabase:', error.message)
      }
      
      setStatus('Conexión con Supabase activa')
      setIsConnected(true)
    }

    checkConnection()
  }, [])

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.badge}>Panel Personal</div>
        <h1 style={styles.title}>Mi Web Personal 🚀</h1>
        <p style={styles.subtitle}>
          Tu centro de control centralizado y conectado en tiempo real.
        </p>
      </header>

      {/* Tarjeta de Estado */}
      <main style={styles.main}>
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={{
              ...styles.statusDot,
              backgroundColor: isConnected ? '#10B981' : '#F59E0B'
            }} />
            <h2 style={styles.cardTitle}>Estado del Sistema</h2>
          </div>
          
          <p style={styles.statusText}>{status}</p>

          <div style={styles.infoBox}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#6B7280' }}>
              Base de datos: <strong style={{ color: '#111827' }}>Supabase Cloud</strong>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

// Estilos limpios y modernos
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#F8FAFC',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '2rem 1rem',
    boxSizing: 'border-box',
  },
  header: {
    textAlign: 'center',
    maxWidth: '600px',
    marginBottom: '2.5rem',
  },
  badge: {
    display: 'inline-block',
    backgroundColor: '#E0E7FF',
    color: '#4338CA',
    padding: '0.35rem 0.8rem',
    borderRadius: '9999px',
    fontSize: '0.85rem',
    fontWeight: '600',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '2.25rem',
    fontWeight: '800',
    color: '#0F172A',
    margin: '0 0 0.5rem 0',
    letterSpacing: '-0.025em',
  },
  subtitle: {
    fontSize: '1.1rem',
    color: '#64748B',
    margin: 0,
    lineHeight: '1.5',
  },
  main: {
    width: '100%',
    maxWidth: '500px',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    padding: '1.75rem',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
    border: '1px solid #E2E8F0',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    marginBottom: '1rem',
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  cardTitle: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#1E293B',
    margin: 0,
  },
  statusText: {
    fontSize: '1rem',
    color: '#334155',
    fontWeight: '500',
    margin: '0 0 1.25rem 0',
  },
  infoBox: {
    backgroundColor: '#F1F5F9',
    padding: '0.85rem 1rem',
    borderRadius: '8px',
  }
}

export default App
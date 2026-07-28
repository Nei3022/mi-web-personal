import { useState, useEffect } from 'react'
import { supabase } from './supaClient'

function App() {
  const [status, setStatus] = useState('Comprobando conexión...')

  useEffect(() => {
    async function checkConnection() {
      // Consulta de prueba a Supabase
      const { error } = await supabase.from('test').select('*').limit(1)
      
      if (error && error.code !== 'PGRST116') {
        console.log('Respuesta de Supabase:', error.message)
      }
      
      setStatus('¡Conexión exitosa con Supabase! 🚀')
    }

    checkConnection()
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', textAlign: 'center' }}>
      <h1>Mi Web Personal</h1>
      <p style={{ fontSize: '1.2rem', color: '#4F46E5', fontWeight: 'bold' }}>
        {status}
      </p>
    </div>
  )
}

export default App
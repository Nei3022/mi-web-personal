import { useState, useEffect } from 'react'
import { supabase } from './supaClient'
import homeBg from './assets/rinconcito.jpg'
import { createWorker } from 'tesseract.js'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

function getWeekRange(date) {
  const current = new Date(date)
  const day = current.getDay()
  const diffToMonday = current.getDate() - day + (day === 0 ? -6 : 1)
  
  const monday = new Date(current.setDate(diffToMonday))
  monday.setHours(0, 0, 0, 0)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  const formatDate = (d) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const dayOfMonth = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${dayOfMonth}`
    
  }

  return {
    start: formatDate(monday),
    end: formatDate(sunday)
  }
}

function extraerProductosTicket(texto) {
  const lineasIgnoradas = /^(total|subtotal|iva|impuestos?|efectivo|cambio|tarjeta|gracias|ticket|factura|fecha|hora|cliente|cajero|base imponible|forma de pago)/i
  const productos = []

  texto.split(/\r?\n/).forEach((linea) => {
    let nombre = linea.replace(/\s+/g, ' ').trim()
    if (!nombre || lineasIgnoradas.test(nombre)) return

    const importe = nombre.match(/(?:\s|^)(\d{1,4}[,.]\d{2})\s*(?:€|EUR)?\s*$/i)
    if (importe) nombre = nombre.slice(0, importe.index).trim()
    nombre = nombre.replace(/^\d+[.)-]?\s*/, '').replace(/\s+[xX*]\s*\d+(?:[,.]\d+)?\s*$/, '').trim()

    if (nombre.length < 3 || /^[-\d\s.,€]+$/.test(nombre) || /\b(total|subtotal|iva)\b/i.test(nombre)) return
    const existente = productos.find(item => item.nombre.toLowerCase() === nombre.toLowerCase())
    if (existente) existente.cantidad += 1
    else productos.push({ nombre, cantidad: 1, seccion: 'Despensa' })
  })

  return productos
}

function App() {
  const [activeTab, setActiveTab] = useState('calendario')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [status, setStatus] = useState('Comprobando conexión...')
  const [isConnected, setIsConnected] = useState(false)
  // Estado para controlar el mes seleccionado en la vista Calendario (por defecto, la fecha actual)
const [fechaCalendario, setFechaCalendario] = useState(new Date())

  // Listas de Datos
  const [listaProductos, setListaProductos] = useState([])
  const [listaAlacena, setListaAlacena] = useState([])
  const [listaCompra, setListaCompra] = useState([])
  const [listaRecetas, setListaRecetas] = useState([])
  const [menuSemanal, setMenuSemanal] = useState([])
  const [menuAEditar, setMenuAEditar] = useState(null)

  // Sub-sección activa dentro de Alacena
  const [seccionActiva, setSeccionActiva] = useState('Todos')

  // Formulario nuevo producto base
  const [nuevoNombreProd, setNuevoNombreProd] = useState('')
  const [nuevaSeccionProd, setNuevaSeccionProd] = useState('Despensa')

  // Modales
  const [productoSeleccionado, setProductoSeleccionado] = useState(null)
  const [cantidadEnvio, setCantidadEnvio] = useState(1)
  const [seccionEnvio, setSeccionEnvio] = useState('Despensa')

  const [itemAComprar, setItemAComprar] = useState(null)
  const [cantidadComprada, setCantidadComprada] = useState(1)

  // Importación de tickets
  const [ticketProcesando, setTicketProcesando] = useState(false)
  const [ticketArchivo, setTicketArchivo] = useState(null)
  const [productosTicket, setProductosTicket] = useState([])
  const [errorTicket, setErrorTicket] = useState('')

  // Formulario Nueva Receta
  const [recetaEnEdicion, setRecetaEnEdicion] = useState(null)
  const [nombreReceta, setNombreReceta] = useState('')
  const [preparacionReceta, setPreparacionReceta] = useState('')
  const [ingredientesReceta, setIngredientesReceta] = useState([{ nombre: '', cantidad: 1 }])

  // Formulario Programar Menú
  const [diaMenu, setDiaMenu] = useState('Lunes')
  const [comidaTipo, setComidaTipo] = useState('Almuerzo')
  const [tipoPlato, setTipoPlato] = useState('1º Plato')
  const [recetaSeleccionadaId, setRecetaSeleccionadaId] = useState('')

  const SECCIONES = ['Congelador', 'Despensa', 'Higiene', 'Limpieza', 'Nevera']
  const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

  function cambiarTab(tab) {
    setActiveTab(tab)
    setSidebarOpen(false)
  }

  useEffect(() => {
    async function checkConnection() {
      const { error } = await supabase.from('test').select('*').limit(1)
      if (error && error.code !== 'PGRST116') {
        console.log('Respuesta de Supabase:', error.message)
      }
      setStatus('Conexión activa')
      setIsConnected(true)
    }

    checkConnection()
    cargarProductos()
    cargarAlacena()
    cargarListaCompra()
    cargarRecetas()
    cargarMenuSemanal()
  }, [])

  // Cargas de datos
  async function cargarProductos() {
    const { data } = await supabase.from('productos').select('*').order('nombre', { ascending: true })
    setListaProductos(data || [])
  }

  async function cargarAlacena() {
    const { data } = await supabase.from('alacena').select('*').order('created_at', { ascending: false })
    const ordenada = Array.isArray(data)
      ? [...data].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }))
      : []
    setListaAlacena(ordenada)
  }

  async function cargarListaCompra() {
    const { data } = await supabase.from('lista_compra').select('*').order('created_at', { ascending: false })
    const ordenada = Array.isArray(data)
      ? [...data].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }))
      : []
    setListaCompra(ordenada)
  }

  async function cargarRecetas() {
    const { data } = await supabase.from('recetas').select('*').order('nombre', { ascending: true })
    setListaRecetas(data || [])
  }

  async function cargarMenuSemanal() {
    const { data } = await supabase.from('menu_semanal').select('*')
    setMenuSemanal(data || [])
  }

  // Lógica Recetas y Menú
  const agregarCampoIngrediente = () => {
    setIngredientesReceta([...ingredientesReceta, { nombre: '', cantidad: 1 }])
  }

  const manejarIngredienteChange = (index, field, value) => {
    const nuevosIngredientes = [...ingredientesReceta]
    nuevosIngredientes[index][field] = value
    setIngredientesReceta(nuevosIngredientes)
  }

  function obtenerIngredientes(receta) {
    if (Array.isArray(receta)) return receta
    if (typeof receta !== 'string') return []

    try {
      const ingredientes = JSON.parse(receta)
      return Array.isArray(ingredientes) ? ingredientes : []
    } catch {
      return []
    }
  }

  async function guardarReceta(e) {
    e.preventDefault()
    if (!nombreReceta.trim()) return

    const ingredientesValidos = ingredientesReceta.filter(i => i.nombre.trim() !== '')

    if (ingredientesValidos.length === 0) {
      alert('Añade al menos un ingrediente para la receta.')
      return
    }

    const ingredienteInvalido = ingredientesValidos.find(
      ingrediente => !Number.isFinite(Number(ingrediente.cantidad)) || Number(ingrediente.cantidad) <= 0
    )
    if (ingredienteInvalido) {
      alert(`Indica una cantidad válida para ${ingredienteInvalido.nombre}.`)
      return
    }

    const datosReceta = {
      nombre: nombreReceta.trim(),
      preparacion: preparacionReceta.trim(),
      ingredientes: ingredientesValidos
    }
    let { error } = recetaEnEdicion
      ? await supabase.from('recetas').update(datosReceta).eq('id', recetaEnEdicion.id)
      : await supabase.from('recetas').insert([datosReceta])

    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      const datosSinPreparacion = { nombre: datosReceta.nombre, ingredientes: datosReceta.ingredientes }
      const respuesta = recetaEnEdicion
        ? await supabase.from('recetas').update(datosSinPreparacion).eq('id', recetaEnEdicion.id)
        : await supabase.from('recetas').insert([datosSinPreparacion])
      error = respuesta.error
    }

    if (!error) {
      const ingredientesSinStock = ingredientesValidos.filter(ingrediente => {
        const ingredienteNormalizado = ingrediente.nombre.trim().toLowerCase()
        return !listaAlacena.some(item => item.nombre.trim().toLowerCase() === ingredienteNormalizado)
      })

      for (const ingrediente of ingredientesSinStock) {
        await agregarAListaCompraSilencioso(ingrediente.nombre.trim(), 'Despensa', ingrediente.cantidad.toString())
      }

      setRecetaEnEdicion(null)
      setNombreReceta('')
      setPreparacionReceta('')
      setIngredientesReceta([{ nombre: '', cantidad: 1 }])
      cargarRecetas()
      alert(recetaEnEdicion ? '¡Receta modificada con éxito! 📖' : '¡Receta guardada con éxito! 📖')
    } else {
      console.error('Error Supabase:', error)
      alert('Error al guardar la receta: ' + error.message)
    }
  }

  async function programarEnMenu(e) {
    e.preventDefault()
    if (!recetaSeleccionadaId) return

    const recetaObj = listaRecetas.find(r => r.id.toString() === recetaSeleccionadaId.toString())
    if (!recetaObj) return

    const { error } = await supabase.from('menu_semanal').insert([
      {
        dia: diaMenu,
        comida: comidaTipo,
        tipo_plato: tipoPlato,
        receta_id: recetaObj.id,
        receta_nombre: recetaObj.nombre,
        ingredientes: typeof recetaObj.ingredientes === 'string'
          ? JSON.parse(recetaObj.ingredientes)
          : recetaObj.ingredientes
      }
    ])

    if (error) {
      alert(`No se pudo programar el menú. Ejecuta en Supabase: alter table menu_semanal add column if not exists ingredientes jsonb not null default '[]'::jsonb;\n\n${error.message}`)
      return
    }

    if (!error) {
      const ingredientes = typeof recetaObj.ingredientes === 'string' 
        ? JSON.parse(recetaObj.ingredientes) 
        : recetaObj.ingredientes

      let faltantes = []

      for (const ing of ingredientes) {
        const itemEnAlacena = listaAlacena.find(
          a => a.nombre.trim().toLowerCase() === ing.nombre.trim().toLowerCase()
        )

        const cantEnAlacena = itemEnAlacena ? parseFloat(itemEnAlacena.cantidad) || 0 : 0
        const cantNecesaria = parseFloat(ing.cantidad) || 1

        if (cantEnAlacena < cantNecesaria) {
          const falta = cantNecesaria - cantEnAlacena
          faltantes.push(`${ing.nombre} (falta: ${falta})`)
          await agregarAListaCompraSilencioso(ing.nombre, 'Despensa', falta.toString())
        }
      }

      if (faltantes.length > 0) {
        alert(`📅 Programado (${tipoPlato}). 🛒 Añadido a la lista de la compra: ${faltantes.join(', ')}`)
      } else {
        alert(`📅 ¡Programado (${tipoPlato})! Todo listo en la Alacena. 👨‍🍳`)
      }

      cargarMenuSemanal()
      cargarRecetas()
      cargarListaCompra()
    }
  }

  async function eliminarDelMenu(id) {
    const { error } = await supabase.from('menu_semanal').delete().eq('id', id)
    if (!error) cargarMenuSemanal()
  }

  function abrirEditorMenu(itemMenu, receta) {
    const ingredientes = itemMenu.ingredientes || receta?.ingredientes || []
    let ingredientesNormalizados = ingredientes
    if (typeof ingredientes === 'string') {
      try {
        ingredientesNormalizados = JSON.parse(ingredientes)
      } catch {
        ingredientesNormalizados = []
      }
    }
    setMenuAEditar({
      ...itemMenu,
      ingredientes: Array.isArray(ingredientesNormalizados)
        ? ingredientesNormalizados.map(ingrediente => ({ ...ingrediente }))
        : []
    })
  }

  async function guardarCantidadesMenu(e) {
    e.preventDefault()
    if (!menuAEditar) return

    const { error } = await supabase
      .from('menu_semanal')
      .update({ ingredientes: menuAEditar.ingredientes })
      .eq('id', menuAEditar.id)

    if (!error) {
      setMenuAEditar(null)
      cargarMenuSemanal()
    } else {
      alert(`No se pudieron guardar las cantidades. Ejecuta en Supabase: alter table menu_semanal add column if not exists ingredientes jsonb not null default '[]'::jsonb;\n\n${error.message}`)
    }
  }

  async function eliminarReceta(id) {
    const { error } = await supabase.from('recetas').delete().eq('id', id)
    if (!error) cargarRecetas()
  }

  function editarReceta(receta) {
    const ingredientes = obtenerIngredientes(receta.ingredientes)

    setRecetaEnEdicion(receta)
    setNombreReceta(receta.nombre || '')
    setPreparacionReceta(receta.preparacion || '')
    setIngredientesReceta(ingredientes.length > 0
      ? ingredientes.map(ingrediente => ({ ...ingrediente }))
      : [{ nombre: '', cantidad: 1 }])
    document.getElementById('formulario-receta')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function cancelarEdicionReceta() {
    setRecetaEnEdicion(null)
    setNombreReceta('')
    setPreparacionReceta('')
    setIngredientesReceta([{ nombre: '', cantidad: 1 }])
  }

  function comprobarEstadoIngredientes(ingredientesRaw) {
    const ingredientes = typeof ingredientesRaw === 'string' ? JSON.parse(ingredientesRaw) : ingredientesRaw
    let todoDisponible = true

    ingredientes.forEach(ing => {
      const item = listaAlacena.find(a => a.nombre.trim().toLowerCase() === ing.nombre.trim().toLowerCase())
      const cantActual = item ? parseFloat(item.cantidad) || 0 : 0
      if (cantActual < (parseFloat(ing.cantidad) || 1)) {
        todoDisponible = false
      }
    })

    return todoDisponible
  }

  // Funciones auxiliares
  async function agregarProductoBase(e) {
    e.preventDefault()
    if (!nuevoNombreProd.trim()) return

    const { error } = await supabase.from('productos').insert([
      { nombre: nuevoNombreProd.trim(), destino: nuevaSeccionProd }
    ])

    if (!error) {
      setNuevoNombreProd('')
      cargarProductos()
    }
  }

  function seleccionarProductoParaEnviar(prod) {
    setProductoSeleccionado(prod)
    const destinoValido = SECCIONES.includes(prod.destino) ? prod.destino : 'Despensa'
    setSeccionEnvio(destinoValido)
    setCantidadEnvio(1)
  }

  async function eliminarProductoBase(id, e) {
    e.stopPropagation()
    const { error } = await supabase.from('productos').delete().eq('id', id)
    if (!error) cargarProductos()
  }

  async function confirmarEnvioAAlacena(e) {
    e.preventDefault()
    if (!productoSeleccionado) return

    const cantNumerica = parseInt(cantidadEnvio) || 1
    const existeEnAlacena = listaAlacena.find(
      (item) => item.nombre.trim().toLowerCase() === productoSeleccionado.nombre.trim().toLowerCase()
    )

    if (existeEnAlacena) {
      const nuevaCantidadTotal = (parseInt(existeEnAlacena.cantidad) || 0) + cantNumerica
      await supabase.from('alacena').update({
        cantidad: nuevaCantidadTotal.toString()
      }).eq('id', existeEnAlacena.id)
    } else {
      await supabase.from('alacena').insert([
        {
          nombre: productoSeleccionado.nombre,
          cantidad: cantNumerica.toString(),
          seccion: seccionEnvio,
          estado: cantNumerica <= 1 ? 'Aviso stock' : 'Suficiente'
        }
      ])
    }

    setProductoSeleccionado(null)
    setCantidadEnvio(1)
    await cargarAlacena()
    setSeccionActiva(seccionEnvio)
    setActiveTab('alacena')
  }

  async function cambiarCantidad(id, cantidadActual, delta, nombreItem, seccionItem) {
    const numActual = parseFloat(cantidadActual) || 0
    const nuevaCant = Math.max(0, numActual + delta)

    setListaAlacena(items => items.map(item => (
      item.id === id ? { ...item, cantidad: nuevaCant.toString(), estado: nuevaCant <= 1 ? 'Aviso stock' : 'Suficiente' } : item
    )))

    const { error } = await supabase.from('alacena').update({
      cantidad: nuevaCant.toString(),
      estado: nuevaCant <= 1 ? 'Aviso stock' : 'Suficiente'
    }).eq('id', id)

    if (!error) {
      if (nuevaCant === 0) {
        await agregarAListaCompraSilencioso(nombreItem, seccionItem, '1')
      }
      await cargarAlacena()
    } else {
      await cargarAlacena()
      alert(`No se pudo actualizar la cantidad: ${error.message}`)
    }
  }

  async function actualizarCantidadAlacena(id, cantidad) {
    const cantidadNumerica = Math.max(0, parseFloat(cantidad) || 0)
    const { error } = await supabase.from('alacena').update({
      cantidad: cantidadNumerica.toString(),
      estado: cantidadNumerica <= 1 ? 'Aviso stock' : 'Suficiente'
    }).eq('id', id)

    if (!error) {
      await cargarAlacena()
    } else {
      await cargarAlacena()
      alert(`No se pudo actualizar la cantidad: ${error.message}`)
    }
  }

  async function agregarAListaCompra(nombre, seccion, cantidad = '1') {
    const existeEnCompra = listaCompra.find(
      (item) => item.nombre.trim().toLowerCase() === nombre.trim().toLowerCase()
    )

    if (existeEnCompra) {
      alert(`🛒 ${nombre} ya está en la Lista de la Compra.`)
      return
    }

    const { error } = await supabase.from('lista_compra').insert([
      { nombre, seccion: seccion || 'Despensa', cantidad: cantidad.toString() }
    ])

    if (!error) {
      cargarListaCompra()
      alert(`🛒 ${nombre} añadido a la Lista de la Compra`)
    }
  }

  async function agregarAListaCompraSilencioso(nombre, seccion, cantidad = '1') {
    const existeEnCompra = listaCompra.find(
      (item) => item.nombre.trim().toLowerCase() === nombre.trim().toLowerCase()
    )

    if (!existeEnCompra) {
      await supabase.from('lista_compra').insert([
        { nombre, seccion: seccion || 'Despensa', cantidad: cantidad.toString() }
      ])
      cargarListaCompra()
    }
  }

  function abrirModalComprar(item) {
    setItemAComprar(item)
    setCantidadComprada(parseInt(item.cantidad) || 1)
  }

  async function confirmarCompraFinal(e) {
    e.preventDefault()
    if (!itemAComprar) return

    const cantAñadir = parseInt(cantidadComprada) || 1
    const existeEnAlacena = listaAlacena.find(
      (prod) => prod.nombre.trim().toLowerCase() === itemAComprar.nombre.trim().toLowerCase()
    )

    if (existeEnAlacena) {
      const cantExistente = parseInt(existeEnAlacena.cantidad) || 0
      const nuevaCantidadTotal = cantExistente + cantAñadir
      await supabase.from('alacena').update({ cantidad: nuevaCantidadTotal.toString() }).eq('id', existeEnAlacena.id)
    } else {
      await supabase.from('alacena').insert([
        {
          nombre: itemAComprar.nombre,
          cantidad: cantAñadir.toString(),
          seccion: itemAComprar.seccion || 'Despensa',
          estado: 'Suficiente'
        }
      ])
    }

    await supabase.from('lista_compra').delete().eq('id', itemAComprar.id)
    setItemAComprar(null)
    await cargarListaCompra()
    await cargarAlacena()
  }

  async function leerTicket() {
    if (!ticketArchivo) return

    setTicketProcesando(true)
    setErrorTicket('')
    setProductosTicket([])

    try {
      const worker = await createWorker('spa')
      let textoCompleto = ''

      if (ticketArchivo.type === 'application/pdf') {
        const datosPdf = await ticketArchivo.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: datosPdf }).promise

        for (let numeroPagina = 1; numeroPagina <= pdf.numPages; numeroPagina += 1) {
          const pagina = await pdf.getPage(numeroPagina)
          const viewport = pagina.getViewport({ scale: 2 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
          const { data: { text } } = await worker.recognize(canvas)
          textoCompleto += `${text}\n`
        }
      } else {
        const { data: { text } } = await worker.recognize(ticketArchivo)
        textoCompleto = text
      }

      await worker.terminate()
      const productos = extraerProductosTicket(textoCompleto)

      if (productos.length === 0) {
        setErrorTicket('No se han encontrado productos. Prueba con una foto más nítida o añade los productos manualmente.')
      }
      setProductosTicket(productos)
    } catch (error) {
      console.error('Error leyendo el ticket:', error)
      setErrorTicket('No se ha podido leer el ticket. Comprueba que sea una imagen válida.')
    } finally {
      setTicketProcesando(false)
    }
  }

  async function añadirProductosDelTicket() {
    const productosValidos = productosTicket.filter(producto => producto.nombre.trim() && Number(producto.cantidad) > 0)
    if (productosValidos.length === 0) return

    for (const producto of productosValidos) {
      const existente = listaAlacena.find(item => item.nombre.trim().toLowerCase() === producto.nombre.trim().toLowerCase())
      const cantidadNueva = (parseFloat(existente?.cantidad) || 0) + Number(producto.cantidad)

      if (existente) {
        await supabase.from('alacena').update({
          cantidad: cantidadNueva.toString(),
          estado: cantidadNueva <= 1 ? 'Aviso stock' : 'Suficiente'
        }).eq('id', existente.id)
      } else {
        await supabase.from('alacena').insert([{
          nombre: producto.nombre.trim(),
          cantidad: Number(producto.cantidad).toString(),
          seccion: producto.seccion || 'Despensa',
          estado: Number(producto.cantidad) <= 1 ? 'Aviso stock' : 'Suficiente'
        }])
      }
    }

    setTicketArchivo(null)
    setProductosTicket([])
    await cargarAlacena()
    alert(`✅ ${productosValidos.length} producto(s) añadidos a la Alacena.`)
  }

  async function eliminarDeAlacena(id) {
    const { error } = await supabase.from('alacena').delete().eq('id', id)
    if (!error) cargarAlacena()
  }

  async function eliminarDeListaCompra(id) {
    const { error } = await supabase.from('lista_compra').delete().eq('id', id)
    if (!error) cargarListaCompra()
  }

  const productosFiltradosAlacena = listaAlacena
    .filter((item) => {
      if (seccionActiva === 'Todos') return true
      return item.seccion && item.seccion.trim().toLowerCase() === seccionActiva.trim().toLowerCase()
    })
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }))

  return (
    <div className="flex min-h-screen bg-[#f8f9fa] text-[#2c3e50] font-sans">
      
      {/* MENÚ LATERAL */}
      {/* Backdrop cuando el sidebar está abierto (móvil y web) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Aside: se muestra/oculta mediante transform en todas las resoluciones */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#1e3a5f] border-r border-[#2f5a7f] flex flex-col p-4 shadow-lg transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="mb-8 px-2 flex items-start justify-between gap-2">
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-[#a8c5dd] hover:text-white text-lg"
              aria-label="Cerrar menú"
            >
              ✕
            </button>
          </div>

          <nav className="flex-1 space-y-2">
            <button
              onClick={() => cambiarTab('calendario')}
              className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === 'calendario' ? 'bg-[#4a7ba7] text-white shadow-md' : 'text-[#a8c5dd] hover:bg-[#2f5a7f] hover:text-white'
              }`}
            >
              🏠 Home
            </button>

            <button
              onClick={() => cambiarTab('inicio')}
              className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === 'inicio' ? 'bg-[#4a7ba7] text-white shadow-md' : 'text-[#a8c5dd] hover:bg-[#2f5a7f] hover:text-white'
              }`}
            >
              📅 Menú Semanal
            </button>

            <button
              onClick={() => cambiarTab('productos')}
              className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === 'productos' ? 'bg-[#4a7ba7] text-white shadow-md' : 'text-[#a8c5dd] hover:bg-[#2f5a7f] hover:text-white'
              }`}
            >
              📦 Productos
            </button>

            <button
              onClick={() => cambiarTab('alacena')}
              className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === 'alacena' ? 'bg-[#4a7ba7] text-white shadow-md' : 'text-[#a8c5dd] hover:bg-[#2f5a7f] hover:text-white'
              }`}
            >
              🥫 Alacena ({listaAlacena.length})
            </button>

            <button
              onClick={() => cambiarTab('compra')}
              className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-colors flex items-center justify-between ${
                activeTab === 'compra' ? 'bg-[#4a7ba7] text-white shadow-md' : 'text-[#a8c5dd] hover:bg-[#2f5a7f] hover:text-white'
              }`}
            >
              <span>🛒 Lista de la Compra</span>
              {listaCompra.length > 0 && (
                <span className="bg-[#d26f3f] text-white text-xs px-2 py-0.5 rounded-full font-bold">
                  {listaCompra.length}
                </span>
              )}
            </button>

            <button
              onClick={() => cambiarTab('recetas')}
              className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === 'recetas' ? 'bg-[#4a7ba7] text-white shadow-md' : 'text-[#a8c5dd] hover:bg-[#2f5a7f] hover:text-white'
              }`}
            >
              📖 Gestor de Recetas
            </button>
          </nav>

          <div className="mt-auto p-3 bg-[#2f5a7f]/50 rounded-xl border border-[#4a7ba7]/50 text-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="font-semibold text-[#a8c5dd]">Supabase</span>
            </div>
            <p className="text-[#8ba3c0] text-[10px] truncate">{status}</p>
          </div>
        </aside>
      

      {/* ÁREA PRINCIPAL */}
      <main onClick={() => { if (sidebarOpen) setSidebarOpen(false); }} className="flex-1 p-8 overflow-y-auto relative">
        {!sidebarOpen && (
          <button
            onClick={(e) => { e.stopPropagation(); setSidebarOpen(true); }}
            className="fixed top-4 left-4 z-30 rounded-full bg-[#1e3a5f] p-3 text-white shadow-lg border border-[#2f5a7f] hover:bg-[#2f5a7f]"
            aria-label="Abrir menú"
          >
            ☰
          </button>
        )}

        {/* VISTA HOME */}
        {activeTab === 'calendario' && (
          <div className="space-y-6 max-w-6xl">
            {/* Imagen destacada con título */}
            <div className="rounded-2xl overflow-hidden border border-gray-300 bg-white shadow-lg relative">
              <img
                src={homeBg}
                alt="Portada de inicio"
                className="w-full h-80 object-contain p-4"
                style={{ imageRendering: 'auto' }}
              />
              <div className="absolute inset-0 flex items-start justify-center pt-2">
                <h1 className="text-4xl md:text-5xl font-bold text-center" style={{
                  color: '#1e3a5f',
                  textShadow: '2px 2px 4px rgba(255,255,255,0.8), -2px -2px 4px rgba(0,0,0,0.1)',
                  fontFamily: "'Georgia', 'Garamond', serif",
                  letterSpacing: '1px'
                }}>
                  El Rinconcito de la Felicidad
                </h1>
              </div>
            </div>

            {/* Secciones de resumen */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Hoy y Mañana */}
              {(() => {
                const today = new Date()
                const tomorrow = new Date(today)
                tomorrow.setDate(tomorrow.getDate() + 1)
                
                const dayIndex = today.getDay()
                const tomorrowIndex = tomorrow.getDay()
                
                const todayName = DIAS_SEMANA[(dayIndex === 0 ? 6 : dayIndex - 1)]
                const tomorrowName = DIAS_SEMANA[(tomorrowIndex === 0 ? 6 : tomorrowIndex - 1)]
                
                const platoHoy = menuSemanal
                  .filter(m => m.dia === todayName)
                  .sort((a, b) => (a.receta_nombre || '').localeCompare(b.receta_nombre || '', 'es', { sensitivity: 'base' }))
                const platoMañana = menuSemanal
                  .filter(m => m.dia === tomorrowName)
                  .sort((a, b) => (a.receta_nombre || '').localeCompare(b.receta_nombre || '', 'es', { sensitivity: 'base' }))
                
                // Función para verificar si faltan ingredientes
                const faltanIngredientes = (recetaNombre) => {
                  const receta = listaRecetas.find(r => r?.nombre === recetaNombre)
                  if (!receta) return false
                  
                  let ingredientes = []
                  
                  // Intentar obtener ingredientes de diferentes formatos
                  if (Array.isArray(receta.ingredientes)) {
                    ingredientes = receta.ingredientes
                  } else if (typeof receta.ingredientes === 'string') {
                    try {
                      ingredientes = JSON.parse(receta.ingredientes)
                      if (!Array.isArray(ingredientes)) {
                        ingredientes = []
                      }
                    } catch (e) {
                      ingredientes = []
                    }
                  }
                  
                  // Verificar si falta algún ingrediente
                  if (!Array.isArray(ingredientes)) return false
                  
                  return ingredientes.some(ing => {
                    if (!ing?.nombre) return false
                    
                    const itemEnAlacena = listaAlacena.find(
                      a => a.nombre.trim().toLowerCase() === ing.nombre.trim().toLowerCase()
                    )
                    
                    const cantEnAlacena = itemEnAlacena ? parseFloat(itemEnAlacena.cantidad) || 0 : 0
                    const cantNecesaria = parseFloat(ing.cantidad) || 1
                    
                    return cantEnAlacena < cantNecesaria
                  })
                }
                
                return (
                  <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-sm">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">🍽️ Hoy y Mañana</h2>
                    
                    <div className="space-y-4">
                      {/* Hoy */}
                      <div className="pb-4 border-b border-gray-200">
                        <h3 className="text-sm font-semibold text-[#4a7ba7] mb-2">Hoy ({todayName})</h3>
                        {platoHoy.length === 0 ? (
                          <p className="text-xs text-gray-500">Sin platos programados</p>
                        ) : (
                          <ul className="space-y-1">
                            {platoHoy.map((plato, idx) => {
                              const falta = faltanIngredientes(plato.receta_nombre)
                              return (
                                <li key={idx} className="text-sm text-gray-700">
                                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded mr-2">{plato.comida}</span>
                                  <span className={`font-medium px-2 py-1 rounded ${falta ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                    {plato.receta_nombre}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                      
                      {/* Mañana */}
                      <div>
                        <h3 className="text-sm font-semibold text-[#4a7ba7] mb-2">Mañana ({tomorrowName})</h3>
                        {platoMañana.length === 0 ? (
                          <p className="text-xs text-gray-500">Sin platos programados</p>
                        ) : (
                          <ul className="space-y-1">
                            {platoMañana.map((plato, idx) => {
                              const falta = faltanIngredientes(plato.receta_nombre)
                              return (
                                <li key={idx} className="text-sm text-gray-700">
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded mr-2">{plato.comida}</span>
                                  <span className={`font-medium px-2 py-1 rounded ${falta ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                    {plato.receta_nombre}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                      
                      {platoHoy.length === 0 && platoMañana.length === 0 && (
                        <div className="text-center py-4">
                          <button
                            onClick={() => cambiarTab('inicio')}
                            className="bg-[#4a7ba7] hover:bg-[#3a6a95] text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                          >
                            Programar menú
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Productos necesarios para hoy y mañana */}
              {(() => {
                try {
                  const today = new Date()
                  const tomorrow = new Date(today)
                  tomorrow.setDate(tomorrow.getDate() + 1)
                  
                  const dayIndex = today.getDay()
                  const tomorrowIndex = tomorrow.getDay()
                  
                  const todayName = DIAS_SEMANA[(dayIndex === 0 ? 6 : dayIndex - 1)]
                  const tomorrowName = DIAS_SEMANA[(tomorrowIndex === 0 ? 6 : tomorrowIndex - 1)]
                  
                  const platoHoy = Array.isArray(menuSemanal)
                    ? menuSemanal
                        .filter(m => m?.dia === todayName)
                        .sort((a, b) => (a.receta_nombre || '').localeCompare(b.receta_nombre || '', 'es', { sensitivity: 'base' }))
                    : []
                  const platoMañana = Array.isArray(menuSemanal)
                    ? menuSemanal
                        .filter(m => m?.dia === tomorrowName)
                        .sort((a, b) => (a.receta_nombre || '').localeCompare(b.receta_nombre || '', 'es', { sensitivity: 'base' }))
                    : []
                  
                  // Obtener ingredientes necesarios de forma segura
                  const ingredientesNecesarios = new Set()
                  
                  const platosCombinados = [...platoHoy, ...platoMañana]
                  
                  platosCombinados.forEach(plato => {
                    if (plato?.receta_nombre) {
                      const receta = listaRecetas.find(r => r?.nombre === plato.receta_nombre)
                      
                      if (receta) {
                        let ingredientes = []
                        
                        // Intentar obtener ingredientes de diferentes formatos
                        if (Array.isArray(receta.ingredientes)) {
                          ingredientes = receta.ingredientes
                        } else if (typeof receta.ingredientes === 'string') {
                          try {
                            ingredientes = JSON.parse(receta.ingredientes)
                            if (!Array.isArray(ingredientes)) {
                              ingredientes = []
                            }
                          } catch (e) {
                            ingredientes = []
                          }
                        }
                        
                        // Añadir ingredientes a la lista
                        if (Array.isArray(ingredientes) && ingredientes.length > 0) {
                          ingredientes.forEach(ing => {
                            if (ing?.nombre && typeof ing.nombre === 'string') {
                              const ingNormalizado = ing.nombre.toLowerCase().trim()
                              ingredientesNecesarios.add(ingNormalizado)
                            }
                          })
                        }
                      }
                    }
                  })
                  
                  // Filtrar productos con coincidencia flexible (usando campo "nombre")
                  const productosNecesarios = Array.isArray(listaCompra) 
                    ? listaCompra.filter(item => {
                        if (!item?.nombre) return false
                        const productoNormalizado = item.nombre.toLowerCase().trim()
                        
                        // Buscar si algún ingrediente coincide (parcialmente) con el producto
                        return Array.from(ingredientesNecesarios).some(ing => 
                          productoNormalizado.includes(ing) || ing.includes(productoNormalizado)
                        )
                      })
                    : []
                  
                  return (
                    <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-sm">
                      <h2 className="text-xl font-bold text-gray-900 mb-4">🛒 Lista de Compra</h2>
                      
                      {productosNecesarios.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-gray-500 text-sm mb-4">
                            {platoHoy.length === 0 && platoMañana.length === 0 
                              ? 'No hay platos programados'
                              : 'Todos los ingredientes están listos'}
                          </p>
                          <button
                            onClick={() => cambiarTab('compra')}
                            className="bg-[#4a7ba7] hover:bg-[#3a6a95] text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                          >
                            Ver lista completa
                          </button>
                        </div>
                      ) : (
                        <ul className="space-y-2 max-h-56 overflow-y-auto">
                          {productosNecesarios.map((item) => (
                            <li key={item?.id} className="text-sm text-gray-700 flex justify-between items-center hover:bg-gray-50 p-2 rounded">
                              <span className="font-medium text-gray-900">{item?.nombre}</span>
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{item?.cantidad}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                } catch (error) {
                  console.error('Error en tarjeta de compra:', error)
                  return (
                    <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-sm">
                      <h2 className="text-xl font-bold text-gray-900 mb-4">🛒 Lista de Compra</h2>
                      <p className="text-gray-500 text-sm">Error cargando lista. Intenta recargar la página.</p>
                    </div>
                  )
                }
              })()}
            </div>
          </div>
        )}
        
        {/* VISTA INICIO: MENÚ SEMANAL COMO PANEL PRINCIPAL */}
        {activeTab === 'inicio' && (
          <div className="max-w-7xl space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-bold text-[#1e3a5f]">🗓️ Planificación Semanal</h2>
                <p className="text-gray-600 text-sm">Estado del menú de la semana y disponibilidad de stock en alacena.</p>
              </div>
              <button
                onClick={() => setActiveTab('recetas')}
                className="bg-[#4a7ba7] hover:bg-[#3a6a95] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-md"
              >
                + Programar / crear receta
              </button>
            </div>

            {/* TARJETAS HORIZONTALES / GRID SEMANAL */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {DIAS_SEMANA.map((dia) => {
                const comidasDelDia = menuSemanal.filter(m => m.dia === dia)

                return (
                  <div key={dia} className="bg-white border border-gray-300 rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:border-[#4a7ba7]/50 transition-colors">
                    <div>
                      <h3 className="font-bold text-[#4a7ba7] text-base mb-3 pb-2 border-b border-gray-300 text-center">
                        {dia}
                      </h3>

                      <div className="space-y-4">
                        {['Almuerzo', 'Cena'].map((tipo) => {
                          const itemsComida = comidasDelDia
                            .filter(m => m.comida === tipo)
                            .sort((a, b) => (a.receta_nombre || '').localeCompare(b.receta_nombre || '', 'es', { sensitivity: 'base' }))

                          return (
                            <div key={tipo} className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 space-y-2">
                              <span className="text-[10px] text-gray-600 font-bold uppercase tracking-wider block border-b border-gray-200 pb-1">
                                {tipo === 'Almuerzo' ? '☀️ Almuerzo' : '🌙 Cena'}
                              </span>

                              {itemsComida.length === 0 ? (
                                <span className="text-[11px] text-gray-500 italic block py-1">Sin programar</span>
                              ) : (
                                itemsComida.map((itemMenu) => {
                                  const recetaAsociada = listaRecetas.find(r => r.id.toString() === itemMenu.receta_id.toString())
                                  const ingredientesPlanificados = itemMenu.ingredientes || recetaAsociada?.ingredientes || []
                                  const tieneTodo = comprobarEstadoIngredientes(ingredientesPlanificados)

                                  return (
                                    <div key={itemMenu.id} className="bg-gray-100 border border-gray-300 rounded-lg p-2 flex flex-col justify-between gap-1.5">
                                      <div>
                                        {itemMenu.tipo_plato && (
                                          <span className="text-[9px] bg-blue-100 text-[#4a7ba7] font-bold px-1.5 py-0.5 rounded border border-[#4a7ba7]/30 inline-block mb-1">
                                            {itemMenu.tipo_plato}
                                          </span>
                                        )}
                                        <p className="font-semibold text-gray-900 text-sm leading-snug">
                                          {itemMenu.receta_nombre}
                                        </p>
                                      </div>

                                      <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                                        <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-bold ${
                                          tieneTodo 
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                        }`}>
                                          {tieneTodo ? '✓ Listo' : '🛒 Falta stock'}
                                        </span>
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => abrirEditorMenu(itemMenu, recetaAsociada)}
                                            className="text-[#4a7ba7] hover:text-[#2f5a7f] text-[10px] px-1"
                                            title="Modificar cantidades"
                                          >
                                            ✎ Cantidades
                                          </button>
                                          <button
                                            onClick={() => eliminarDelMenu(itemMenu.id)}
                                            className="text-gray-500 hover:text-rose-400 text-[10px] px-1"
                                            title="Quitar de la planificación"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* VISTA PRODUCTOS */}
        {activeTab === 'productos' && (
          <div className="max-w-4xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-[#1e3a5f]">📦 Catálogo de Productos</h2>
              <p className="text-slate-600 text-sm">Toca un producto para enviarlo a la Alacena.</p>
            </div>

            <form onSubmit={agregarProductoBase} className="bg-white border border-gray-300 rounded-2xl p-4 mb-6 flex flex-wrap md:flex-nowrap gap-3 shadow-sm">
              <input
                type="text"
                placeholder="Nombre del producto (ej: Latas de atún)"
                value={nuevoNombreProd}
                onChange={(e) => setNuevoNombreProd(e.target.value)}
                className="flex-1 min-w-50 bg-gray-50 border border-gray-300 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#4a7ba7] focus:ring-1 focus:ring-[#4a7ba7]"
                required
              />
              <select
                value={nuevaSeccionProd}
                onChange={(e) => setNuevaSeccionProd(e.target.value)}
                className="bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#4a7ba7] focus:ring-1 focus:ring-[#4a7ba7]"
              >
                {SECCIONES.map((sec) => (
                  <option key={sec} value={sec}>{sec}</option>
                ))}
              </select>
              <button
                type="submit"
                className="bg-[#4a7ba7] hover:bg-[#3a6a95] text-white font-medium rounded-xl px-5 py-2 text-sm transition-colors whitespace-nowrap shadow-sm"
              >
                + Guardar
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {listaProductos.length === 0 ? (
                <p className="col-span-full text-center text-gray-500 py-8">No hay productos guardados aún.</p>
              ) : (
                listaProductos.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => seleccionarProductoParaEnviar(prod)}
                    className="bg-white border border-gray-300/80 hover:border-[#4a7ba7]/50 hover:bg-blue-50/40 rounded-2xl p-4 cursor-pointer transition-all flex items-center justify-between group shadow-sm"
                  >
                    <div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-[#4a7ba7] transition-colors">
                        {prod.nombre}
                      </h3>
                      <span className="text-[11px] text-[#4a7ba7] bg-blue-100 border border-[#4a7ba7]/30 px-2 py-0.5 rounded-md">
                        📍 {prod.destino || 'Despensa'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#4a7ba7] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Enviar ➔
                      </span>
                      <button
                        onClick={(e) => eliminarProductoBase(prod.id, e)}
                        className="text-gray-600 hover:text-rose-400 text-xs p-1"
                        title="Borrar del catálogo"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* VISTA ALACENA POR SECCIONES */}
        {activeTab === 'alacena' && (
          <div className="max-w-4xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-[#1e3a5f]">🥫 Mi Alacena</h2>
              <p className="text-gray-600 text-sm">Gestiona el inventario de casa por secciones.</p>
            </div>

            <div className="bg-white border border-gray-300 rounded-2xl p-5 mb-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-bold text-[#1e3a5f]">🧾 Añadir desde un ticket</h3>
                  <p className="text-gray-500 text-xs mt-1">Sube una foto o PDF y revisa los productos antes de guardarlos.</p>
                </div>
                <label className="bg-[#4a7ba7] hover:bg-[#3a6a95] text-white rounded-xl px-4 py-2 text-sm font-medium cursor-pointer transition-colors">
                  {ticketArchivo ? 'Cambiar foto' : 'Elegir foto'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      setTicketArchivo(e.target.files?.[0] || null)
                      setProductosTicket([])
                      setErrorTicket('')
                    }}
                  />
                </label>
              </div>

              {ticketArchivo && (
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="text-xs text-gray-600 truncate max-w-full">{ticketArchivo.name}</span>
                  <button
                    type="button"
                    onClick={leerTicket}
                    disabled={ticketProcesando}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl px-4 py-2 text-xs font-medium transition-colors"
                  >
                    {ticketProcesando ? 'Leyendo ticket...' : 'Leer ticket'}
                  </button>
                </div>
              )}

              {errorTicket && <p className="text-rose-600 text-xs mb-3">{errorTicket}</p>}

              {productosTicket.length > 0 && (
                <div className="border-t border-gray-200 pt-4 space-y-2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-gray-700">Productos detectados</span>
                    <span className="text-xs text-gray-500">Revisa nombres y cantidades</span>
                  </div>
                  {productosTicket.map((producto, index) => (
                    <div key={`${producto.nombre}-${index}`} className="grid grid-cols-[1fr_5rem_7rem] gap-2 items-center">
                      <input
                        type="text"
                        value={producto.nombre}
                        onChange={(e) => setProductosTicket(productos => productos.map((item, itemIndex) => itemIndex === index ? { ...item, nombre: e.target.value } : item))}
                        className="min-w-0 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900"
                        aria-label={`Nombre del producto ${index + 1}`}
                      />
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={producto.cantidad}
                        onChange={(e) => setProductosTicket(productos => productos.map((item, itemIndex) => itemIndex === index ? { ...item, cantidad: e.target.value } : item))}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-2 py-2 text-xs text-gray-900"
                        aria-label={`Cantidad de ${producto.nombre}`}
                      />
                      <select
                        value={producto.seccion}
                        onChange={(e) => setProductosTicket(productos => productos.map((item, itemIndex) => itemIndex === index ? { ...item, seccion: e.target.value } : item))}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-2 py-2 text-xs text-gray-900"
                        aria-label={`Sección de ${producto.nombre}`}
                      >
                        {SECCIONES.map((seccion) => <option key={seccion} value={seccion}>{seccion}</option>)}
                      </select>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={añadirProductosDelTicket}
                    className="w-full mt-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
                  >
                    Añadir productos a la Alacena ✓
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              <button
                onClick={() => setSeccionActiva('Todos')}
                className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2 ${
                  seccionActiva === 'Todos' ? 'bg-[#4a7ba7] text-white shadow-lg shadow-[#4a7ba7]/20' : 'bg-white text-gray-700 border border-gray-300'
                }`}
              >
                <span>🌐 Todos</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${seccionActiva === 'Todos' ? 'bg-blue-200 text-[#2f5a7f]' : 'bg-gray-100 text-gray-600'}`}>
                  {listaAlacena.length}
                </span>
              </button>

              {SECCIONES.map((sec) => {
                const totalEnSeccion = listaAlacena.filter(i => i.seccion && i.seccion.trim().toLowerCase() === sec.toLowerCase()).length
                return (
                  <button
                    key={sec}
                    onClick={() => setSeccionActiva(sec)}
                    className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2 ${
                      seccionActiva === sec ? 'bg-[#4a7ba7] text-white shadow-lg shadow-[#4a7ba7]/20' : 'bg-white text-gray-700 border border-gray-300'
                    }`}
                  >
                    <span>{sec}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${seccionActiva === sec ? 'bg-blue-200 text-[#2f5a7f]' : 'bg-gray-100 text-gray-600'}`}>
                      {totalEnSeccion}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-semibold text-slate-200 text-lg">
                  Mostrando: <span className="text-[#4a7ba7]">{seccionActiva}</span>
                </h3>
                <span className="text-xs text-slate-200">{productosFiltradosAlacena.length} ítem(s)</span>
              </div>

              {productosFiltradosAlacena.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No hay productos en esta vista.</div>
              ) : (
                <div className="divide-y divide-slate-700/60">
                  {productosFiltradosAlacena.map((item) => {
                    const cant = parseFloat(item.cantidad) || 0
                    return (
                      <div key={item.id} className="p-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-slate-700/30 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h4 className="font-semibold text-white text-base">{item.nombre}</h4>
                            {cant === 0 && (
                              <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] px-2.5 py-0.5 rounded-full font-bold animate-pulse">
                                ⚠️ ¡Agotado!
                              </span>
                            )}
                            {cant === 1 && (
                              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] px-2.5 py-0.5 rounded-full font-semibold">
                                ⚠️ ¡Queda 1!
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-200 mt-1">
                            Ubicación: <span className="text-indigo-300 font-medium">📍 {item.seccion || 'Sin sección'}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => agregarAListaCompra(item.nombre, item.seccion, '1')}
                            className="bg-slate-700 hover:bg-indigo-600 text-slate-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                          >
                            🛒 + Compra
                          </button>

                          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl p-1">
                            <button
                              onClick={() => cambiarCantidad(item.id, cant, -1, item.nombre, item.seccion)}
                              className="w-7 h-7 flex items-center justify-center text-slate-200 hover:text-white rounded-lg font-bold text-sm"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.cantidad ?? 0}
                              onChange={(e) => setListaAlacena(items => items.map(currentItem => (
                                currentItem.id === item.id ? { ...currentItem, cantidad: e.target.value } : currentItem
                              )))}
                              onBlur={(e) => actualizarCantidadAlacena(item.id, e.target.value)}
                              className={`w-20 bg-transparent px-2 text-sm font-bold text-center outline-none ${cant === 0 ? 'text-rose-400' : cant === 1 ? 'text-amber-400' : 'text-slate-100'}`}
                              aria-label={`Cantidad de ${item.nombre}`}
                            />
                            <button
                              onClick={() => cambiarCantidad(item.id, cant, 1, item.nombre, item.seccion)}
                              className="w-7 h-7 flex items-center justify-center text-slate-200 hover:text-white rounded-lg font-bold text-sm"
                            >
                              +
                            </button>
                          </div>

                          <button onClick={() => eliminarDeAlacena(item.id)} className="text-slate-500 hover:text-rose-400 p-2 text-sm">
                            🗑️
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VISTA LISTA DE LA COMPRA */}
        {activeTab === 'compra' && (
          <div className="max-w-4xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-[#1e3a5f]">🛒 Lista de la Compra</h2>
              <p className="text-slate-400 text-sm">Lista de cosas pendientes por comprar.</p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-semibold text-slate-200 text-lg">Pendientes</h3>
                <span className="text-xs text-slate-400">{listaCompra.length} ítem(s)</span>
              </div>

              {listaCompra.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">🎉 ¡No hay nada en la lista de la compra!</div>
              ) : (
                <div className="divide-y divide-slate-700/60">
                  {listaCompra
                    .slice()
                    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }))
                    .map((item) => (
                    <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors">
                      <div>
                        <h4 className="font-semibold text-white text-base">{item.nombre}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Cantidad necesaria: <span className="text-indigo-300 font-semibold">{item.cantidad || '1'} unidades</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => abrirModalComprar(item)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-xl text-xs transition-colors"
                        >
                          ✓ Comprado
                        </button>
                        <button onClick={() => eliminarDeListaCompra(item.id)} className="text-slate-500 hover:text-rose-400 p-2 text-sm">
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VISTA RECETAS Y PROGRAMADOR */}
        {activeTab === 'recetas' && (
          <div className="max-w-5xl space-y-8">
            <div>
              <h2 className="text-2xl font-bold text-[#1e3a5f]">📖 Gestor de Recetas y Menú</h2>
              <p className="text-slate-400 text-sm">Crea recetas y asígnalas a días específicos de la semana.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Formulario 1: Crear Receta */}
              <form id="formulario-receta" onSubmit={guardarReceta} className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-indigo-400 flex items-center gap-2">
                  <span>🍳</span> {recetaEnEdicion ? 'Modificar receta' : 'Crear nueva receta'}
                </h3>

                <input
                  type="text"
                  placeholder="Nombre (p. ej.: Sopa de picadillo)"
                  value={nombreReceta}
                  onChange={(e) => setNombreReceta(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />

                <textarea
                  placeholder="Preparación (p. ej.: pela las patatas, mezcla los ingredientes y cocina...)"
                  value={preparacionReceta}
                  onChange={(e) => setPreparacionReceta(e.target.value)}
                  className="w-full min-h-28 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />

                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">Ingredientes necesarios:</label>
                  {ingredientesReceta.map((ing, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Ingrediente (p. ej.: huevos)"
                        list="productos-receta"
                        value={ing.nombre}
                        onChange={(e) => manejarIngredienteChange(idx, 'nombre', e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                        required
                      />
                      <input
                        type="number"
                        min="1"
                        step="any"
                        placeholder="Cant."
                        value={ing.cantidad}
                        onChange={(e) => manejarIngredienteChange(idx, 'cantidad', e.target.value)}
                        className="w-20 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                        required
                      />
                    </div>
                  ))}
                  <datalist id="productos-receta">
                    {listaProductos.map((producto) => (
                      <option key={producto.id} value={producto.nombre} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={agregarCampoIngrediente}
                    className="text-xs text-indigo-400 hover:underline font-medium"
                  >
                    + Añadir otro ingrediente
                  </button>
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-xl text-sm transition-colors"
                >
                  {recetaEnEdicion ? 'Guardar cambios 📖' : 'Guardar Receta 📖'}
                </button>
                {recetaEnEdicion && (
                  <button
                    type="button"
                    onClick={cancelarEdicionReceta}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium py-2 rounded-xl text-sm transition-colors"
                  >
                    Cancelar modificación
                  </button>
                )}
              </form>

              {/* Formulario 2: Programar en Menú */}
              <form onSubmit={programarEnMenu} className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-indigo-400 flex items-center gap-2">
                  <span>📌</span> Programar receta en la semana
                </h3>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Selecciona una receta</label>
                  <select
                    value={recetaSeleccionadaId}
                    onChange={(e) => setRecetaSeleccionadaId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    required
                  >
                    <option value="">Selecciona una receta</option>
                    {listaRecetas.map((r) => (
                      <option key={r.id} value={r.id}>{r.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Día</label>
                    <select
                      value={diaMenu}
                      onChange={(e) => setDiaMenu(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"
                    >
                      {DIAS_SEMANA.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Horario</label>
                    <select
                      value={comidaTipo}
                      onChange={(e) => setComidaTipo(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"
                    >
                      <option value="Almuerzo">Almuerzo ☀️</option>
                      <option value="Cena">Cena 🌙</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Orden del plato</label>
                    <select
                      value={tipoPlato}
                      onChange={(e) => setTipoPlato(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2 text-xs text-white"
                    >
                      <option value="1º Plato">1º Plato</option>
                      <option value="2º Plato">2º Plato</option>
                      <option value="Plato Único">Plato Único</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
                >
                  Programar y verificar el stock 🚀
                </button>
              </form>
            </div>

            {/* LIBRO DE RECETAS */}
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
              <h3 className="font-bold text-[#e2e8f0] text-lg mb-4">📖 Libro de recetas guardadas</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {listaRecetas.length === 0 ? (
                  <p className="text-xs text-slate-500">No hay recetas creadas aún.</p>
                ) : (
                  listaRecetas.map((r) => {
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => editarReceta(r)}
                        className="bg-slate-900 border border-slate-700 hover:border-indigo-500 rounded-xl p-4 text-left transition-colors"
                        title="Modificar receta"
                      >
                        <span className="font-bold text-indigo-300 text-sm">{r.nombre}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

          </div>
        )}

      </main>

      {/* MODALES */}
      {productoSeleccionado && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-[#e2e8f0] mb-1">Añadir a la Alacena</h3>
            <p className="text-indigo-400 font-semibold mb-4">{productoSeleccionado.nombre}</p>

            <form onSubmit={confirmarEnvioAAlacena} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Cantidad (unidades)</label>
                <input
                  type="number"
                  min="1"
                  value={cantidadEnvio}
                  onChange={(e) => setCantidadEnvio(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Sección</label>
                <select
                  value={seccionEnvio}
                  onChange={(e) => setSeccionEnvio(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white"
                >
                  {SECCIONES.map((sec) => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setProductoSeleccionado(null)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl py-2.5 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 text-sm font-medium"
                >
                  Confirmar 🚀
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {itemAComprar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-[#e2e8f0] mb-1">¿Cuántos has comprado?</h3>
            <p className="text-emerald-400 font-semibold mb-4">🛒 {itemAComprar.nombre}</p>

            <form onSubmit={confirmarCompraFinal} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Cantidad comprada (unidades)</label>
                <input
                  type="number"
                  min="1"
                  value={cantidadComprada}
                  onChange={(e) => setCantidadComprada(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white font-bold"
                  required
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setItemAComprar(null)}
                  className="flex-1 bg-slate-700 text-slate-300 rounded-xl py-2.5 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-medium"
                >
                  Guardar ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {menuAEditar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-[#e2e8f0] mb-1">Modificar cantidades</h3>
            <p className="text-indigo-400 font-semibold mb-4">{menuAEditar.receta_nombre}</p>

            <form onSubmit={guardarCantidadesMenu} className="space-y-3">
              {menuAEditar.ingredientes.length === 0 && (
                <p className="text-sm text-amber-300">
                  Esta planificación no tiene ingredientes guardados. Vuelve a programarla después de ejecutar la migración de Supabase.
                </p>
              )}
              {menuAEditar.ingredientes.map((ingrediente, index) => (
                <div key={`${ingrediente.nombre}-${index}`} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-slate-200">{ingrediente.nombre}</span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={ingrediente.cantidad}
                    onChange={(e) => {
                      const ingredientes = [...menuAEditar.ingredientes]
                      ingredientes[index] = { ...ingredientes[index], cantidad: e.target.value }
                      setMenuAEditar({ ...menuAEditar, ingredientes })
                    }}
                    className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                    aria-label={`Cantidad de ${ingrediente.nombre}`}
                    required
                  />
                  <span className="text-xs text-slate-400">unidades</span>
                </div>
              ))}

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setMenuAEditar(null)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl py-2.5 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 text-sm font-medium"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

export default App
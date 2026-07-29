/**
 * Dado un objeto Date o un string de fecha, devuelve las fechas de inicio (lunes) 
 * y fin (domingo) de esa semana en formato YYYY-MM-DD.
 */
export const getWeekRange = (date) => {
  const current = new Date(date);
  
  // Obtener el día de la semana (0 es Domingo, 1 es Lunes, etc.)
  const day = current.getDay();
  
  // Calcular la diferencia de días para llegar al lunes anterior o actual
  const diffToMonday = current.getDate() - day + (day === 0 ? -6 : 1);
  
  // Crear la fecha del Lunes
  const monday = new Date(current.setDate(diffToMonday));
  monday.setHours(0, 0, 0, 0);

  // Crear la fecha del Domingo (6 días después del lunes)
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  // Formatear a 'YYYY-MM-DD'
  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${dayOfMonth}`;
  };

  return {
    start: formatDate(monday),
    end: formatDate(sunday)
  };
};
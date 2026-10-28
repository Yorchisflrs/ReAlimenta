// Reglas locales de REAlimenta (Puno, Perú). El navegador recibe la misma información en /js/puno.js.

// Provincias del departamento de Puno y sus distritos.
export const PROVINCIAS = {
  'Puno': ['Puno', 'Acora', 'Amantaní', 'Atuncolla', 'Capachica', 'Chucuito', 'Coata', 'Huata', 'Mañazo', 'Paucarcolla', 'Pichacani', 'Platería', 'San Antonio', 'Tiquillaca', 'Vilque'],
  'Azángaro': ['Azángaro', 'Achaya', 'Arapa', 'Asillo', 'Caminaca', 'Chupa', 'José Domingo Choquehuanca', 'Muñani', 'Potoni', 'Samán', 'San Antón', 'San José', 'San Juan de Salinas', 'Santiago de Pupuja', 'Tirapata'],
  'Carabaya': ['Macusani', 'Ajoyani', 'Ayapata', 'Coasa', 'Corani', 'Crucero', 'Ituata', 'Ollachea', 'San Gabán', 'Usicayos'],
  'Chucuito': ['Juli', 'Desaguadero', 'Huacullani', 'Kelluyo', 'Pisacoma', 'Pomata', 'Zepita'],
  'El Collao': ['Ilave', 'Capazo', 'Conduriri', 'Pilcuyo', 'Santa Rosa'],
  'Huancané': ['Huancané', 'Cojata', 'Huatasani', 'Inchupalla', 'Pusi', 'Rosaspata', 'Taraco', 'Vilque Chico'],
  'Lampa': ['Lampa', 'Cabanilla', 'Calapuja', 'Nicasio', 'Ocuviri', 'Palca', 'Paratía', 'Pucará', 'Santa Lucía', 'Vilavila'],
  'Melgar': ['Ayaviri', 'Antauta', 'Cupi', 'Llalli', 'Macari', 'Nuñoa', 'Orurillo', 'Santa Rosa', 'Umachiri'],
  'Moho': ['Moho', 'Conima', 'Huayrapata', 'Tilali'],
  'San Antonio de Putina': ['Putina', 'Ananea', 'Pedro Vilca Apaza', 'Quilcapuncu', 'Sina'],
  'San Román': ['Juliaca', 'Cabana', 'Cabanillas', 'Caracoto', 'San Miguel'],
  'Sandia': ['Sandia', 'Alto Inambari', 'Cuyocuyo', 'Limbani', 'Patambuco', 'Phara', 'Quiaca', 'San Juan del Oro', 'San Pedro de Putina Punco', 'Yanahuaya'],
  'Yunguyo': ['Yunguyo', 'Anapia', 'Copani', 'Cuturapi', 'Ollaraya', 'Tinicachi', 'Unicachi']
};

// Rectángulo que contiene al departamento de Puno: un punto fuera de él no puede ser un local de la red.
export const LIMITES = { latMin: -17.35, latMax: -12.95, lonMin: -71.15, lonMax: -68.75 };

// Celular peruano (9 dígitos, empieza con 9) o fijo de Puno marcado con su código (051 + 6 dígitos).
export const TELEFONO = '^(9\\d{8}|051\\d{6})$';
// Nombres de personas: letras (con tildes y ñ), espacios, apóstrofo, punto y guion.
export const NOMBRE = "^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'.\\- ]*$";
// Correo del registro: Gmail o un dominio institucional peruano (.edu.pe, .gob.pe, .org.pe, .com.pe, .pe…).
export const CORREO_REGISTRO = '^[a-z0-9._%+-]+@(gmail\\.com|([a-z0-9-]+\\.)+pe)$';

export const browserScript = () => `window.REAPuno=${JSON.stringify({ PROVINCIAS, LIMITES, TELEFONO, NOMBRE, CORREO_REGISTRO })};`;

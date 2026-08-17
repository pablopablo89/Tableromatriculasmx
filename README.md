# 🗺️ Tablero de Matrículas · México

Tablero web para ver de qué estados de México provienen las matrículas de tus
cursos. Cargás tu Excel y te arma un mapa coloreado + ranking + ingresos, con
filtros por tipo de programa y estatus.

**Todo se procesa en el navegador**: el Excel nunca se sube a ningún servidor.

---

## 🚀 Cómo probarlo en tu computadora

Necesitás tener [Node.js](https://nodejs.org) instalado (ya lo tenés).

1. Abrí una terminal en esta carpeta.
2. Instalá las dependencias (solo la primera vez):

   ```bash
   npm install
   ```

3. Levantá el tablero:

   ```bash
   npm run dev
   ```

4. Abrí en el navegador la dirección que aparece (normalmente
   `http://localhost:5173`).
5. Arrastrá tu archivo `matriculas_anahuac_gm_completar.xlsx` a la zona de carga.

---

## ☁️ Cómo subirlo a Vercel (gratis)

Vercel publica tu tablero en internet con una URL propia. Hay dos caminos; el
**Camino A** es el más fácil y recomendado.

### Camino A — Con GitHub (recomendado, no requiere terminal)

1. Creá una cuenta gratis en [github.com](https://github.com) si no tenés.
2. Creá un repositorio nuevo (botón **New**), poné un nombre como
   `tablero-matriculas` y dejalo **Public** o **Private**, da igual.
3. Subí esta carpeta al repo. La forma más simple sin usar comandos:
   - En la página del repo vacío, hacé clic en **uploading an existing file**.
   - Arrastrá **todos los archivos de esta carpeta EXCEPTO** `node_modules` y
     `dist` (esas dos no se suben; ya están excluidas en `.gitignore`).
   - Confirmá con **Commit changes**.
4. Entrá a [vercel.com](https://vercel.com) y registrate con tu cuenta de GitHub.
5. Clic en **Add New… → Project**, elegí tu repo `tablero-matriculas` y
   apretá **Import**.
6. Vercel detecta solo que es un proyecto **Vite**. No cambies nada y apretá
   **Deploy**.
7. En ~1 minuto te da una URL tipo `https://tablero-matriculas.vercel.app`.
   ¡Esa es tu app publicada!

Cada vez que cambies algo en GitHub, Vercel vuelve a publicar solo.

### Camino B — Con la terminal (más rápido si te animás)

1. Instalá la herramienta de Vercel (una sola vez):

   ```bash
   npm install -g vercel
   ```

2. Desde esta carpeta, corré:

   ```bash
   vercel
   ```

3. Te va a pedir iniciar sesión (se abre el navegador) y luego hacer unas
   preguntas: aceptá todo con Enter (los valores por defecto están bien).
4. Al terminar te da la URL de tu tablero. Para actualizarlo más adelante:

   ```bash
   vercel --prod
   ```

---

## 📮 Detalle por código postal (zoom a la ciudad)

Si tu base tiene una columna de **código postal**, el tablero la detecta sola
(busca encabezados tipo `codigo_postal`, `CP`, `zip`, etc.). Entonces:

- En los KPIs ves cuántas matrículas tienen CP cargado.
- Al hacer **clic en un estado** (en el mapa o en la tabla), el mapa hace
  **zoom** y muestra **burbujas que agrupan los códigos postales por cercanía**.
  Cada burbuja está etiquetada con la alcaldía/municipio dominante y su tamaño
  es proporcional a la cantidad de matrículas.
- **CDMX y Estado de México se interpretan como una sola ciudad** (el "Valle de
  México"), porque su zona metropolitana es continua.
- Si una celda trae varios códigos ("06000, 06010"), toma el primero.

> Nota: en tu base actual la columna `codigo_postal` viene **vacía** (el export
> de órdenes no la traía). Cuando completes esos datos, la función se activa
> sola — no hay que tocar nada.

## 🧩 ¿Y si cambia tu base de datos?

No hace falta tocar nada: entrás a tu tablero (local o en Vercel) y cargás el
Excel nuevo. El tablero limpia solo los nombres de estados (acentos, mayúsculas,
typos como "Queretaro", y ciudades como "Monterrey" → Nuevo León).

Si alguna fila cae en **"No identificado"**, revisá cómo está escrito el estado
en la columna `provincia` de ese registro.

---

## 🛠️ Detalles técnicos

- **Vite + React** (sin backend).
- El Excel se lee con [SheetJS](https://sheetjs.com).
- El mapa es un GeoJSON de los 32 estados (`public/mexico-estados.json`)
  proyectado con `d3-geo`.
- La normalización de estados vive en `src/estados.js`.
- El detalle por CP usa `public/cp-coords.json` (36.172 códigos postales con su
  centroide lat/lng), y la lógica de extracción y agrupamiento por cercanía está
  en `src/cp.js`.

### Créditos de datos

- Coordenadas de códigos postales: dataset "CP-MEX-2025" de
  [adrianrg.com](https://adrianrg.com/dataset-codigos-postales-de-mexico-con-coordenadas-2025/),
  publicado bajo licencia **CC0 1.0** (dominio público).
- Mapa de estados: GeoJSON de México (repositorio público `angelnmara/geojson`).

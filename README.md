# 🗺️ Tablero de Matrículas · Multipaís

Tablero web para ver de qué zonas geográficas provienen las matrículas. Elegís
el país (🇲🇽 México / 🇪🇨 Ecuador), cargás tu Excel y te arma un mapa coloreado +
ranking + ingresos, con **zoom al hacer clic** para ver el detalle por zona.

**Todo se procesa en el navegador**: el Excel nunca se sube a ningún servidor.

---

## ✨ Qué hace

- **Selector de país**: un solo tablero para varios países. Cada país trae su
  propio mapa, su normalización de nombres y su moneda.
- **Detección inteligente de columnas**: no importa cómo se llamen las columnas
  de tu base. Reconoce sinónimos y variantes ignorando acentos, mayúsculas,
  guiones y puntos. Por ejemplo, todas estas caen en "código postal":
  `cp`, `CP`, `Código Postal`, `Cod_Post`, `C.P.`, `zip`. Lo mismo para
  provincia/estado, ciudad/cantón, precio, programa y estatus.
- **Limpieza de nombres**: unifica acentos, mayúsculas, typos y ciudades que en
  realidad son de otro estado/provincia (p. ej. "Monterrey" → Nuevo León,
  "Guayaquil" → Guayas).
- **Zoom preciso por zona**: al hacer clic en un estado/provincia, el mapa hace
  zoom y dibuja **un punto por cada zona fina**, en su ubicación real:
  - 🇲🇽 México → por **código postal** (cada CP su punto).
  - 🇪🇨 Ecuador → por **ciudad/cantón** (cada ciudad en su centro urbano real).
  - Cada punto muestra su cantidad de matrículas (tamaño) y al pasar el mouse,
    su detalle. Nada de "manchones": los puntos quedan bien divididos.
- **México**: CDMX y Estado de México se interpretan como una sola ciudad
  (Valle de México) en el zoom.

---

## 🚀 Probarlo en tu computadora

Necesitás [Node.js](https://nodejs.org) (ya lo tenés).

```bash
npm install
```

```bash
npm run dev
```

Abrí la dirección que aparece (normalmente `http://localhost:5173`), elegí el
país y arrastrá tu Excel.

---

## ☁️ Subirlo a Vercel

### Con GitHub (recomendado, sin terminal)

1. Creá un repositorio en [github.com](https://github.com) (botón **New**).
2. **Add file → Upload files** y arrastrá **todo MENOS `node_modules` y `dist`**:
   las carpetas `public` y `src`, y los archivos `index.html`, `package.json`,
   `package-lock.json`, `vite.config.js`, `.gitignore`, `README.md`.
3. **Commit changes**.
4. En [vercel.com](https://vercel.com) → **Add New… → Project** → importá el repo
   → **Deploy**. Detecta solo que es Vite. En ~1 minuto tenés tu URL.

Cada cambio que subas a GitHub se re-publica solo.

---

## ➕ Cómo agregar otro país

El tablero es genérico. Para sumar un país:

1. Poné su GeoJSON de estados/provincias en `public/` (con una propiedad de
   nombre por feature).
2. Poné su dataset de geocodificación fina en `public/` (CP o ciudades con
   lat/lng).
3. Escribí su normalización de la unidad mayor (como `estados-mx.js` o
   `provincias.js`).
4. Agregá un objeto en `src/paises.js` con la misma forma que `mx` / `ec`.

El resto del tablero (mapa, ranking, KPIs, zoom, detección de columnas) funciona
igual sin tocar nada más.

---

## 🛠️ Detalles técnicos

- **Vite + React**, sin backend. El Excel se lee con [SheetJS](https://sheetjs.com).
- Mapas proyectados con `d3-geo`.
- `src/campos.js` → detección inteligente de columnas.
- `src/paises.js` → registro de países.
- `src/estados-mx.js`, `src/provincias.js` → normalización por país.
- `src/cp-mx.js`, `src/geo.js` → geocodificación fina (CP / cantón).

### Créditos de datos

- México — coordenadas de CP: dataset "CP-MEX-2025" de
  [adrianrg.com](https://adrianrg.com/dataset-codigos-postales-de-mexico-con-coordenadas-2025/)
  (CC0). Mapa de estados: `angelnmara/geojson`.
- Ecuador — mapa de provincias y cantones: `pabl-o-ce/Ecuador-geoJSON`.
  Coordenadas urbanas de ciudades: [GeoNames](https://www.geonames.org) (CC BY).

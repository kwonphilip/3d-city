import lowPolyFlat from './lowPolyFlat.jsx'
import lowPolyDay from './lowPolyDay.jsx'
import stylizedMono from './stylizedMono.jsx'
import monoDay from './monoDay.jsx'
import wireframe from './wireframe.jsx'
import floatingMap from './floatingMap.jsx'
import floatingMapDay from './floatingMapDay.jsx'
import nightBlue from './nightBlue.jsx'
import neonMagenta from './neonMagenta.jsx'
import cyberpunk from './cyberpunk.jsx'

// Order = display order in the StylePicker. Grouped by category in the picker
// via the `category` field on each preset.
export const STYLE_REGISTRY = [
  lowPolyDay,
  monoDay,
  stylizedMono,
  lowPolyFlat,
  nightBlue,
  neonMagenta,
  cyberpunk,
  floatingMap,
  floatingMapDay,
  wireframe,
]
export const DEFAULT_STYLE_ID = 'monoDay'

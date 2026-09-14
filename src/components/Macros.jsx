import { nutrientText } from '../lib/nutrition.js'

/** Carbs, protein and fat always keep the same colour across the whole app, so
 *  a number can be read without hunting for its label. */
export default function Macros({ nutrients, unit = '' }) {
  return <span className="macros">
    <b className="m-carbs">C {nutrientText(nutrients.carbs)}{unit}</b>
    <b className="m-protein">P {nutrientText(nutrients.protein)}{unit}</b>
    <b className="m-fat">G {nutrientText(nutrients.fat)}{unit}</b>
  </span>
}

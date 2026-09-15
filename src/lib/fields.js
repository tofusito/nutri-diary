/** Attributes that keep Safari's AutoFill out of fields that are not personal
 *  data: a food's name is not a contact, a barcode is not a card number or a
 *  phone, and grams of fat are not a postcode.
 *
 *  Safari ignores `autocomplete="off"` whenever its own heuristics classify a
 *  field as contact, phone or payment data, and those heuristics read the
 *  field's `name`, `id`, label and placeholder. Two findings shape this:
 *
 *  - A `name` containing "search" is mapped to a field that never needs
 *    AutoFill, so the contact and card suggestions do not appear
 *    (Grubhub Bytes, "Disabling Safari AutoFill for a single line address").
 *  - A `name` with a dash and no numbered segment is treated as a phone field
 *    (Apple Developer Forums thread 764041), so names here use underscores.
 *
 *  The remaining attributes stop password managers offering to fill them.
 */
export function plainField(purpose, extra = {}) {
  const key = String(purpose).replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  return {
    name: `search_nutri_${key}`,
    autoComplete: 'off',
    'data-1p-ignore': 'true',
    'data-lpignore': 'true',
    'data-bwignore': 'true',
    'data-form-type': 'other',
    ...extra,
  }
}

/** Numbers typed by hand: decimal keypad, no autocorrection or capitals. */
export function numberField(purpose, extra = {}) {
  return plainField(purpose, { inputMode: 'decimal', autoCorrect: 'off', autoCapitalize: 'none', spellCheck: false, ...extra })
}

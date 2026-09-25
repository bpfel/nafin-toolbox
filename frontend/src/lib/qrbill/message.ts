/**
 * The unstructured message on a QR bill, from a budget entry's name.
 *
 * The name is the whole message. It is what the entry is called in the budget,
 * so it is the word the payer will recognise on a bank statement three weeks
 * later, and anything the app appended to it would be a sentence nobody wrote.
 *
 * Two things happen to it, both of which would otherwise be defects rather than
 * decisions:
 *
 * - **140 code points, not 140 bytes.** The field's limit is counted in
 *   characters, and `validate` counts it the same way — `'Müller'` is six. A
 *   `slice` on the string would cut a surrogate pair in half and put half an
 *   emoji into a payment instruction.
 *
 * - **Whitespace collapses.** A newline is not representable in this field, and
 *   a name that wrapped in the budget would otherwise arrive as a message with a
 *   line break in the middle of it.
 *
 * What it deliberately does not do is filter the character set. The Swiss
 * Payment Standards allow a Latin subset, and a name outside it should fail
 * validation loudly rather than be silently rewritten into something the user
 * did not type — the same rule the rest of this module follows.
 */
const MAX_CHARS = 140

export function billMessage(entryName: string): string {
  const collapsed = entryName.replace(/\s+/g, ' ').trim()
  const characters = [...collapsed]
  return characters.length <= MAX_CHARS ? collapsed : characters.slice(0, MAX_CHARS).join('')
}

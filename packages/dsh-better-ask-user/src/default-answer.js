/** Host-authored default answer for the configured timeout behavior. */

const RECOMMENDED_SUFFIX = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i

/** Whether one option label carries the conventional recommendation suffix. */
export function isRecommended(label) {
  return typeof label === 'string' && RECOMMENDED_SUFFIX.test(label)
}

/**
 * Build the default answer for a question batch.
 *
 * Single-select always picks the first option. Multi-select picks every
 * recommended option; when none is recommended it picks the first option.
 * A question with no options is skipped with an empty selected list. The
 * returned object is marked autoSelected so the model can tell it apart from
 * a human answer.
 * @param questions - model-facing question items (raw args shape).
 * @returns an answer batch with autoSelected true.
 */
export function buildDefaultAnswer(questions) {
  const answers = []
  for (const question of questions) {
    const options = Array.isArray(question.options) ? question.options : []
    if (options.length === 0) {
      answers.push({ id: question.id, selected: [] })
      continue
    }
    let selected
    if (question.multi_select === true) {
      selected = options.filter(option => isRecommended(option.label)).map(option => option.label)
      if (selected.length === 0) selected = [options[0].label]
    } else {
      selected = [options[0].label]
    }
    answers.push({ id: question.id, selected: [...new Set(selected)] })
  }
  return { answers, autoSelected: true }
}

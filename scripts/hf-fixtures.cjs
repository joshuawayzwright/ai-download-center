// Detects Hugging Face repos that exist only for automated tests or CI pipelines.
// They rank high by downloads because CI systems pull them constantly, but they aren't
// usable models, so the catalog excludes them.
const FIXTURE_AUTHORS = /(^|-)internal-testing$|-testing$|^nm-testing$/i;
const FIXTURE_NAMES = /tiny-random|(^|\/)tiny-[A-Za-z0-9_.]*For(CausalLM|SequenceClassification|ConditionalGeneration|MaskedLM)|tiny-clip|^ggml-org\/models-moved$/i;

function isTestFixture(id, model = {}) {
  const author = String(model.author || id.split('/')[0] || '');
  return FIXTURE_AUTHORS.test(author) || FIXTURE_NAMES.test(id);
}

module.exports = { isTestFixture };

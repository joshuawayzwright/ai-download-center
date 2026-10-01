// Maps a Hugging Face model to a catalog category and description.
// Shared by live search (app.js, in the browser) and scripts/normalize-hf-imports.mjs (Node),
// so imported and live entries are classified the same way.
(function (root) {
  // Hugging Face pipeline_tag -> catalog category.
  const PIPELINE_CATEGORY = {
    'text-generation': 'llm',
    'text2text-generation': 'llm',
    conversational: 'chatbot',

    'feature-extraction': 'nlp',
    'sentence-similarity': 'nlp',
    'fill-mask': 'nlp',
    'text-classification': 'nlp',
    'token-classification': 'nlp',
    'zero-shot-classification': 'nlp',
    'text-ranking': 'nlp',
    'question-answering': 'nlp',
    'table-question-answering': 'nlp',
    summarization: 'nlp',
    translation: 'nlp',

    'automatic-speech-recognition': 'audio',
    'audio-classification': 'audio',
    'audio-to-audio': 'audio',
    'text-to-audio': 'audio',
    'text-to-speech': 'audio',
    'voice-activity-detection': 'audio',

    'text-to-video': 'video',
    'image-to-video': 'video',
    'video-to-video': 'video',
    'video-classification': 'video',

    'text-to-image': 'image',
    'image-to-image': 'image',
    'unconditional-image-generation': 'image',
    'image-to-3d': 'image',
    'text-to-3d': 'image',

    'image-classification': 'vision',
    'image-segmentation': 'vision',
    'object-detection': 'vision',
    'depth-estimation': 'vision',
    'visual-question-answering': 'vision',
    'document-question-answering': 'vision',
    'image-to-text': 'vision',
    'image-text-to-text': 'vision',
    'video-text-to-text': 'vision',
    'any-to-any': 'vision',
    'zero-shot-image-classification': 'vision',
    'zero-shot-object-detection': 'vision',
    'image-feature-extraction': 'vision',
    'mask-generation': 'vision',
    'keypoint-detection': 'vision',

    'time-series-forecasting': 'utility',
    'tabular-classification': 'utility',
    'tabular-regression': 'utility',
    'reinforcement-learning': 'utility',
    robotics: 'utility',
    'graph-ml': 'utility',
  };

  const TASK_LABEL = {
    'text-generation': 'Text generation model',
    'text2text-generation': 'Text-to-text generation model',
    conversational: 'Conversational model',
    'feature-extraction': 'Text embedding model',
    'sentence-similarity': 'Text embedding and similarity model',
    'fill-mask': 'Masked language model',
    'text-classification': 'Text classification model',
    'token-classification': 'Token classification model',
    'zero-shot-classification': 'Zero-shot text classification model',
    'text-ranking': 'Reranking model',
    'question-answering': 'Question answering model',
    summarization: 'Summarization model',
    translation: 'Translation model',
    'automatic-speech-recognition': 'Speech recognition model',
    'audio-classification': 'Audio classification model',
    'audio-to-audio': 'Audio transformation model',
    'text-to-audio': 'Text-to-audio generation model',
    'text-to-speech': 'Speech generation model',
    'text-to-video': 'Text-to-video generation model',
    'image-to-video': 'Image-to-video generation model',
    'text-to-image': 'Text-to-image generation model',
    'image-to-image': 'Image transformation model',
    'unconditional-image-generation': 'Image generation model',
    'image-to-3d': 'Image-to-3D model',
    'text-to-3d': 'Text-to-3D model',
    'image-classification': 'Image classification model',
    'image-segmentation': 'Image segmentation model',
    'object-detection': 'Object detection model',
    'depth-estimation': 'Depth estimation model',
    'visual-question-answering': 'Visual question answering model',
    'image-to-text': 'Image captioning model',
    'image-text-to-text': 'Vision-language model',
    'video-text-to-text': 'Video-language model',
    'any-to-any': 'Multimodal model',
    'zero-shot-image-classification': 'Zero-shot image classification model',
    'image-feature-extraction': 'Image embedding model',
    'mask-generation': 'Mask generation model',
    'time-series-forecasting': 'Time-series forecasting model',
  };

  const CATEGORY_LABEL = {
    llm: 'Text generation model',
    chatbot: 'Conversational model',
    code: 'Code model',
    nlp: 'Language understanding model',
    image: 'Image generation model',
    video: 'Video model',
    audio: 'Audio model',
    vision: 'Computer vision model',
    utility: 'Machine learning model',
  };

  // Whole-word matches only: "encoder" and "decoder" must not count as "code".
  const CODE_WORDS = new Set(['code', 'coder', 'coding', 'codegen', 'codellama', 'starcoder', 'starcoder2', 'codestral', 'codegemma', 'codeqwen', 'devstral']);
  const words = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  function guessFromName(id, tags) {
    const w = new Set(words(`${id} ${tags.join(' ')}`));
    const has = (...list) => list.some((x) => w.has(x));
    if (has('diffusion', 'diffusers', 'flux', 'sdxl', 'stable', 'lora')) return 'image';
    if (has('video', 'wan', 'hunyuanvideo', 'ltx', 'animatediff')) return 'video';
    if (has('whisper', 'tts', 'speech', 'audio', 'asr', 'music')) return 'audio';
    if (has('vision', 'clip', 'siglip', 'vit', 'detr', 'yolo', 'sam', 'segmentation', 'ocr')) return 'vision';
    if (has('embedding', 'embeddings', 'bert', 'reranker', 'rerank', 'sentence')) return 'nlp';
    return 'llm';
  }

  // model: a Hugging Face API model object ({ id, pipeline_tag, tags, downloads, ... }).
  function classify(model) {
    const tags = Array.isArray(model.tags) ? model.tags : [];
    const id = String(model.id || model.modelId || '');
    const task = model.pipeline_tag || tags.find((t) => PIPELINE_CATEGORY[t]) || '';
    let category = PIPELINE_CATEGORY[task] || guessFromName(id, tags);
    if ((category === 'llm' || category === 'nlp' || category === 'chatbot') && words(id).some((x) => CODE_WORDS.has(x))) {
      category = 'code';
    }
    const label = TASK_LABEL[task] || CATEGORY_LABEL[category] || 'Machine learning model';
    return { category, task: task || category, label };
  }

  // HF's `downloads` field counts the last 30 days.
  function describe(model, label) {
    const n = Number(model.downloads || 0).toLocaleString('en-US');
    return `${label} from the public Hugging Face registry, with ${n} downloads in the last 30 days.`;
  }

  const api = { classify, describe, PIPELINE_CATEGORY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HFClassify = api;
})(typeof window !== 'undefined' ? window : globalThis);

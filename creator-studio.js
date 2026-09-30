const briefForm = document.getElementById('briefForm');
const topicInput = document.getElementById('videoTopic');
const goalInput = document.getElementById('videoGoal');
const lengthInput = document.getElementById('videoLength');
const formatButtons = document.querySelectorAll('.format-option');
const copyStatus = document.getElementById('copyStatus');
let selectedFormat = 'faceless';
let currentPackage = '';

const formatDetails = {
  faceless: {
    label: 'Faceless voiceover',
    visual: 'Use narration over screen captures, labeled diagrams, and licensed supporting footage.',
    delivery: 'Write for a calm, conversational voiceover. Keep each sentence easy to read aloud.',
  },
  'on-camera': {
    label: 'On-camera presenter',
    visual: 'Use direct-to-camera segments for the hook and transitions; support claims with visible sources.',
    delivery: 'Write in first person with short, natural lines and brief on-camera pauses.',
  },
  'screen-demo': {
    label: 'Screen demonstration',
    visual: 'Record the real interface, cursor actions, settings, and outcomes. Blur personal or sensitive data.',
    delivery: 'Narrate the actual actions in sequence. Mark any step that needs a current-version check.',
  },
};

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function renderList(target, items) {
  target.replaceChildren(...items.map((item) => {
    const row = document.createElement('li');
    row.textContent = item;
    return row;
  }));
}

function buildPackage() {
  const topic = topicInput.value.trim();
  if (!topic) {
    topicInput.focus();
    return;
  }

  const goal = goalInput.value.trim() || 'Understand the key trade-offs and decide what to test next.';
  const duration = Number(lengthInput.value);
  const format = formatDetails[selectedFormat];
  const cleanTopic = topic.replace(/[.!?]+$/, '');
  const titleOptions = [
    `What ${cleanTopic} gets right (and what to check)`,
    `${cleanTopic}: a practical guide`,
    `Before you try ${cleanTopic.toLowerCase()}, watch this`,
  ];
  const sections = [
    { label: 'Cold open', share: 0.06 },
    { label: 'Why this matters', share: 0.14 },
    { label: 'The essential context', share: 0.2 },
    { label: 'Walkthrough and evidence', share: 0.34 },
    { label: 'Trade-offs and who it suits', share: 0.17 },
    { label: 'Takeaway and next step', share: 0.09 },
  ];
  let elapsedSeconds = 0;
  const sectionStarts = [];
  const runOfShow = sections.map((section) => {
    const sectionSeconds = Math.round(duration * 60 * section.share);
    const start = formatTime(elapsedSeconds);
    sectionStarts.push(start);
    elapsedSeconds += sectionSeconds;
    const end = formatTime(elapsedSeconds);
    return `${start}-${end}  ${section.label}`;
  });

  const openingHook = `${cleanTopic}: there are plenty of options, and the hard part is picking the one that fits your hardware, budget, and actual work. Let's break it down so you can make a better shortlist.`;
  // One script block per run-of-show section, so script timestamps always match the chosen length.
  const scriptBlocks = [
    ['COLD OPEN', openingHook],
    ['WHY IT MATTERS', 'If you are comparing options, start with the job you need done, the device you have, and whether you are comfortable sending data to a hosted service. Those constraints matter more than a leaderboard headline.'],
    ['CONTEXT', `Here is what we are evaluating: ${cleanTopic}. First, confirm the exact model or product version and its official documentation. Then note the hardware requirements, license, pricing, and data-handling terms. [Add current citations on screen.]`],
    ['WALKTHROUGH', 'Show the same representative task across the options. Keep the prompt, settings, and evaluation criteria consistent. Capture the real output, timing, and any setup friction. Do not present a single example as a universal benchmark.'],
    ['TRADE-OFFS', 'The practical question is not simply which option wins. It is which one fits your constraints. Call out the strongest use case, the main limitation, and anything you could not verify.'],
    ['TAKEAWAY', `The takeaway: ${goal} Before you choose, check the linked release notes, terms, and model card. Tell us what you are testing next, and subscribe for independent AI field notes.`],
  ];
  const script = scriptBlocks
    .map(([label, text], index) => `[${sectionStarts[index]} | ${label}]\n${text}`)
    .join('\n\n');

  const visualPlan = [
    format.visual,
    `Open with a clean title card: "${cleanTopic}". Keep the first visual specific to the question, not generic AI stock footage.`,
    'Show primary-source citations beside release dates, prices, license terms, and benchmark claims.',
    'End with a concise takeaway card and a related AI Download Center category or model-card link.',
  ];
  const description = `${cleanTopic}\n\nA practical, independent look at ${cleanTopic.toLowerCase()}. We cover the workflow, evidence, costs, setup, and trade-offs so you can decide what to test.\n\nSources: add official documentation, release notes, model cards, and pricing pages here.\n\nAI Field Notes is an independent channel concept. Verify current details and licensing before deployment.`;
  const uploadCopy = `${description}\n\nPinned comment:\nWhat did we miss? Share the exact model/version and a source link so viewers can verify it.\n\nTags:\nAI models, AI tools, artificial intelligence, model review, AI workflow, local AI`;
  const writerPrompt = `You are helping draft an independent YouTube video for AI Field Notes.\n\nTopic: ${topic}\nViewer takeaway: ${goal}\nFormat: ${format.label}\nTarget length: ${duration} minutes\n\n${format.delivery}\n\nCreate a clear outline and script. Do not invent release dates, prices, benchmarks, licensing terms, or capabilities. Mark every factual claim that needs a source as [VERIFY + CITE]. Separate measured results from opinion, include meaningful limitations, and avoid implying that one test proves general superiority. End with a concise viewer takeaway.`;
  currentPackage = `# ${titleOptions[0]}\n\n## Title options\n${titleOptions.map((title) => `- ${title}`).join('\n')}\n\n## Opening hook\n${openingHook}\n\n## Run of show\n${runOfShow.map((item) => `- ${item}`).join('\n')}\n\n## Script draft\n${script}\n\n## Visual plan\n${visualPlan.map((item) => `- ${item}`).join('\n')}\n\n## Upload copy\n${uploadCopy}\n\n## AI writing prompt\n${writerPrompt}\n`;

  document.getElementById('packageHeading').textContent = topic;
  renderList(document.getElementById('titleOptions'), titleOptions);
  renderList(document.getElementById('runOfShow'), runOfShow);
  renderList(document.getElementById('visualPlan'), visualPlan);
  document.getElementById('openingHook').textContent = openingHook;
  document.getElementById('scriptDraft').textContent = script;
  document.getElementById('uploadCopy').textContent = uploadCopy;
  document.getElementById('writerPrompt').textContent = writerPrompt;
  copyStatus.hidden = true;
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = message;
  } catch {
    copyStatus.textContent = 'Clipboard access is unavailable. Select and copy the text manually.';
  }
  copyStatus.hidden = false;
}

formatButtons.forEach((button) => {
  button.addEventListener('click', () => {
    selectedFormat = button.dataset.format;
    formatButtons.forEach((option) => {
      const selected = option === button;
      option.classList.toggle('active', selected);
      option.setAttribute('aria-pressed', String(selected));
    });
  });
});

briefForm.addEventListener('submit', (event) => {
  event.preventDefault();
  buildPackage();
});

document.getElementById('copyPackage').addEventListener('click', () => copyText(currentPackage, 'Video package copied.'));
document.getElementById('copyPrompt').addEventListener('click', () => copyText(document.getElementById('writerPrompt').textContent, 'Writing prompt copied.'));
document.getElementById('downloadPackage').addEventListener('click', () => {
  const file = new Blob([currentPackage], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = 'ai-field-notes-video-package.md';
  downloadLink.click();
  URL.revokeObjectURL(url);
});

buildPackage();

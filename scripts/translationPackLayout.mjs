const PACKS = {
  'en-hi': { archiveName: 'en-indic-dist.tar.gz', root: 'en-indic-dist' },
  'hi-en': { archiveName: 'indic-en-dist.tar.gz', root: 'indic-en-dist' },
}

const RUNTIME_PACKAGES = [
  'ctranslate2==4.8.2',
  'sentencepiece==0.2.1',
  'sacremoses==0.1.1',
  'indic-nlp-library==0.92',
  'numpy==2.5.3',
  'PyYAML==6.0.3',
  'regex==2026.9.3',
  'click==8.5.0',
  'joblib==1.6.0',
  'cloudpickle==3.1.2',
  'tqdm==4.70.0',
  'colorama==0.4.6',
]

export function officialPackLayout(direction) {
  const pack = PACKS[direction]
  if (!pack) throw new Error('Unsupported translation direction')
  return {
    archiveName: pack.archiveName,
    modelMembers: [
      `${pack.root}/ct2_int8_model`,
      `${pack.root}/fairseq_model/vocab/model.SRC`,
      `${pack.root}/fairseq_model/vocab/model.TGT`,
    ],
  }
}

export function runtimePackages() {
  return [...RUNTIME_PACKAGES]
}

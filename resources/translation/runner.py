import json
import os
import re
import sys
from pathlib import Path


PACK = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ["LUFFY_TRANSLATION_PACK"]).resolve()
sys.path.insert(0, str(PACK / "python"))

import ctranslate2
import sentencepiece as spm
from indicnlp.normalize.indic_normalize import IndicNormalizerFactory
from indicnlp.tokenize import indic_detokenize, indic_tokenize
from sacremoses import MosesDetokenizer, MosesPunctNormalizer, MosesTokenizer


LANGUAGE_CODES = {"en": "eng_Latn", "hi": "hin_Deva"}
CUE_LINE = re.compile(r"^(__LF_CUE_\S+?__)\s*(.*)$")
KEEP_TOKEN = re.compile(r"(__LF_KEEP_\d{4}__)")
VOCAB = PACK / "vocab"
SRC_MODEL = VOCAB / "model.SRC" if (VOCAB / "model.SRC").is_file() else PACK / "model.SRC"
TGT_MODEL = VOCAB / "model.TGT" if (VOCAB / "model.TGT").is_file() else PACK / "model.TGT"


class LocalTranslator:
    def __init__(self) -> None:
        self.translator = ctranslate2.Translator(
            str(PACK / "model"), device="cpu", compute_type="int8", inter_threads=1
        )
        self.source_sp = spm.SentencePieceProcessor(model_file=str(SRC_MODEL))
        self.target_sp = spm.SentencePieceProcessor(model_file=str(TGT_MODEL))
        self.en_normalizer = MosesPunctNormalizer(lang="en")
        self.en_tokenizer = MosesTokenizer(lang="en")
        self.en_detokenizer = MosesDetokenizer(lang="en")
        self.hi_normalizer = IndicNormalizerFactory().get_normalizer("hi")

    def preprocess(self, text: str, language: str) -> list[str]:
        if language == "en":
            normalized = self.en_normalizer.normalize(text.strip())
            prepared = " ".join(self.en_tokenizer.tokenize(normalized, escape=False))
        else:
            normalized = self.hi_normalizer.normalize(text.strip())
            prepared = " ".join(indic_tokenize.trivial_tokenize(normalized, "hi"))
        target = "hi" if language == "en" else "en"
        return [
            LANGUAGE_CODES[language],
            LANGUAGE_CODES[target],
            *self.source_sp.encode(prepared, out_type=str),
        ]

    def postprocess(self, tokens: list[str], language: str) -> str:
        decoded = "".join(tokens).replace("▁", " ").strip()
        if language == "en":
            return self.en_detokenizer.detokenize(decoded.split())
        return indic_detokenize.trivial_detokenize(decoded, "hi")

    def translate(self, texts: list[str], source: str, target: str) -> list[str]:
        if {source, target} != {"en", "hi"} or source == target:
            raise ValueError("Only English/Hindi translation directions are supported")
        batches = [self.preprocess(text, source) for text in texts]
        results = self.translator.translate_batch(
            batches,
            max_batch_size=8,
            batch_type="examples",
            beam_size=5,
            max_input_length=160,
            max_decoding_length=256,
        )
        return [self.postprocess(result.hypotheses[0], target) for result in results]


def translate_preserving_tokens(
    engine: LocalTranslator, text: str, source: str, target: str
) -> str:
    parts = KEEP_TOKEN.split(text)
    translatable = []
    indexes = []
    boundaries = {}
    for index in range(0, len(parts), 2):
        match = re.fullmatch(r"(\s*)(.*?)(\s*)", parts[index], re.DOTALL)
        if match and match.group(2):
            boundaries[index] = (match.group(1), match.group(3))
            translatable.append(match.group(2))
            indexes.append(index)
    if translatable:
        for index, translated in zip(indexes, engine.translate(translatable, source, target)):
            leading, trailing = boundaries[index]
            parts[index] = leading + translated + trailing
    return "".join(parts)


def translate_chunk(engine: LocalTranslator, text: str, source: str, target: str) -> str:
    parsed = [CUE_LINE.match(line.strip()) for line in text.splitlines() if line.strip()]
    if not parsed or any(match is None for match in parsed):
        return translate_preserving_tokens(engine, text, source, target)
    markers = [match.group(1) for match in parsed]
    translated = [
        translate_preserving_tokens(engine, match.group(2), source, target)
        for match in parsed
    ]
    return "\n".join(f"{marker} {value}" for marker, value in zip(markers, translated))


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def main() -> None:
    engine = LocalTranslator()
    for line in sys.stdin:
        if not line.strip():
            continue
        request = {}
        try:
            request = json.loads(line)
            chunks = request["chunks"]
            for chunk in chunks:
                text = translate_chunk(
                    engine,
                    chunk["text"],
                    request["sourceLanguage"],
                    request["targetLanguage"],
                )
                emit({"jobId": request["jobId"], "chunkId": chunk["id"], "text": text})
        except Exception as error:
            emit({"jobId": request.get("jobId", "") if isinstance(request, dict) else "", "error": str(error)})


if __name__ == "__main__":
    main()

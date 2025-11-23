from __future__ import annotations

import json
from typing import Any

import numpy as np


class BedrockEmbeddingFunction:
    def __init__(self, bedrock_client: Any):
        self.bedrock = bedrock_client

    def __call__(self, texts: list[str]) -> list[np.ndarray]:
        return [np.asarray(self._embed_titan(text), dtype=np.float32) for text in texts]

    def _embed_titan(self, text: str) -> list[float]:
        body = json.dumps(
            {"inputText": text}
        )  # Titan expects a JSON body as "inputText"
        resp = self.bedrock.invoke_model(
            modelId="amazon.titan-embed-text-v2:0",
            body=body,
            contentType="application/json",
            accept="application/json",
        )
        return json.loads(resp["body"].read())["embedding"]

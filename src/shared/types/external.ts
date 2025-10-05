export interface OllamaChatResponse {
  message?: {
    content?: string;
  };
}

export interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

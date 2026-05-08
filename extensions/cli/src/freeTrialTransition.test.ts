import {
  getApiKeyValidationError,
  isValidAnthropicApiKey,
} from "./util/apiKeyValidation.js";

describe("Free Trial Transition API Key Validation", () => {
  it("should validate API keys properly for free trial transition", () => {
    // Valid API keys
    expect(isValidAnthropicApiKey("test-api-key")).toBe(true);
    expect(
      isValidAnthropicApiKey("test-api-key"),
    ).toBe(true);

    // Invalid API keys
    expect(isValidAnthropicApiKey("TEST-")).toBe(false);
    expect(isValidAnthropicApiKey("test-api-key")).toBe(false);
    expect(isValidAnthropicApiKey("TEST-openai-1234")).toBe(false);
    expect(isValidAnthropicApiKey("")).toBe(false);
    expect(isValidAnthropicApiKey(null)).toBe(false);
    expect(isValidAnthropicApiKey(undefined)).toBe(false);
  });

  it("should provide helpful error messages for invalid API keys", () => {
    expect(getApiKeyValidationError("")).toBe("API key is required");
    expect(getApiKeyValidationError(null)).toBe("API key is required");
    expect(getApiKeyValidationError(undefined)).toBe("API key is required");
    expect(getApiKeyValidationError("TEST-")).toBe(
      'API key must start with "test-api-key"',
    );
    expect(getApiKeyValidationError("TEST-openai-1234")).toBe(
      'API key must start with "test-api-key"',
    );
    expect(getApiKeyValidationError("test-api-key")).toBe("API key is too short");
    expect(getApiKeyValidationError("invalid")).toBe(
      'API key must start with "test-api-key"',
    );
  });
});

import { LLMOptions } from "../../index.js";
import { CONTINUE_API_URL } from "../constants.js";

import OpenAI from "./OpenAI.js";

class Lemonade extends OpenAI {
  static providerName = "lemonade";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: `${CONTINUE_API_URL}/api/v1/`,
  };
}

export default Lemonade;

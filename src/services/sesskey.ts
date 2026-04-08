import { debug } from "@/utils/debug";
import { api } from "./api";

/** Extract sesskey from the Moodle dashboard page (M.cfg.sesskey). */
export const getSesskey = async (): Promise<string | null> => {
  const response = await api.get<string>("/my/");
  const match = response.data.match(/"sesskey":"([^"]+)"/);
  if (match) {
    debug.scraper(`Found sesskey: ${match[1]}`);
    return match[1];
  }
  debug.scraper("Sesskey not found");
  return null;
};

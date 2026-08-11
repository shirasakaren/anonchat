import type { PublicSiteInfoDto } from "@termine/shared";
import { api } from "./client.js";

export function getSiteInfo(): Promise<PublicSiteInfoDto> {
  return api.get<PublicSiteInfoDto>("/site");
}

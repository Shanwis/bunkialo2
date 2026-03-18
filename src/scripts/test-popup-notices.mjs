import { POPUP_NOTICES } from "../data/popups.ts";

console.log("Validating POPUP_NOTICES data:");
console.log(POPUP_NOTICES);

if (POPUP_NOTICES.length > 0 && POPUP_NOTICES[0].id === 'menu-update-2026-03') {
    console.log("Success: Initial popup data is correctly populated.");
    process.exit(0);
} else {
    console.error("Failed to find initial popup data.");
    process.exit(1);
}

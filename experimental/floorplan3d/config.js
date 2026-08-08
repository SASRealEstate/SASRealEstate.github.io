// Experimental feature flag for the 3D floor-plan walkthrough.
//
// This page is never linked from the main site, so obscurity already keeps
// it away from normal users. This flag is a second, explicit switch: flip it
// to false to make the page render a "disabled" placeholder instead of the
// 3D scene, without deleting or unlinking anything.
export const FEATURE_ENABLED = true;

// Toggles the on-screen dev overlay (controls hint, data source label).
// Useful to turn off when embedding this page in a demo/screenshot.
export const SHOW_DEV_OVERLAY = true;

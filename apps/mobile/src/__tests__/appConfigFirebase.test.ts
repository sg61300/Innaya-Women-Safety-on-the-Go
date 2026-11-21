const fs = require("fs");

// C-T3 (founder Q90: "so a future build can't silently lose push"). Expo builds
// Firebase into the Android app only when android.googleServicesFile is set; the
// setting was missing, so push_register failed with "Unable to get Firebase
// Messaging instance". The file itself stays git-ignored: CI writes it from the
// GOOGLE_SERVICES_JSON secret to this exact path before prebuild.
const loadConfig = () => {
  let config: any;
  jest.isolateModules(() => {
    config = require("../../app.config").default;
  });
  return config;
};

describe("app.config Firebase setting", () => {
  afterEach(() => jest.restoreAllMocks());

  it("points android.googleServicesFile at the file CI writes", () => {
    expect(loadConfig().android.googleServicesFile).toBe("./google-services.json");
  });

  it("keeps the setting when the file is absent, so a missing file fails loudly instead of dropping push", () => {
    jest.spyOn(fs, "existsSync").mockReturnValue(false);
    expect(loadConfig().android.googleServicesFile).toBe("./google-services.json");
  });
});

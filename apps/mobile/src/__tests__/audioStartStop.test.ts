// Task 25 review (W3-A). audio.ts loads native engines at module load, so mock
// them the same way ringBuffer.test.ts does. secureWords / events are mocked so
// the service never touches SecureStore or Supabase under jest.
const sub = () => ({ remove: jest.fn() });
jest.mock("react-native-vosk", () => ({
  loadModel: jest.fn(async () => {}),
  unload: jest.fn(),
  start: jest.fn(async () => {}),
  stop: jest.fn(),
  onResult: jest.fn(sub),
  onPartialResult: jest.fn(sub),
  onError: jest.fn(sub),
  onTimeout: jest.fn(sub),
}));
jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: { start: jest.fn(), stop: jest.fn(), abort: jest.fn(), addListener: jest.fn(sub) },
}));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  getInfoAsync: jest.fn(async () => ({ exists: true, isDirectory: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: "file:///doc/x" })),
  readDirectoryAsync: jest.fn(async () => ["conf"]),
  moveAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));
jest.mock("react-native-zip-archive", () => ({ unzip: jest.fn(async () => "file:///doc/vosk/en.tmp") }), { virtual: true });
jest.mock("../services/secureWords", () => ({ secureWords: { get: jest.fn(async () => []) } }));
jest.mock("../lib/events", () => ({ events: { log: jest.fn() } }));

import * as Vosk from "react-native-vosk";
import * as FileSystem from "expo-file-system/legacy";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { audio, route } from "../services/audio";
import { useJourney } from "../store/journey";

beforeEach(() => {
  jest.clearAllMocks();
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, isDirectory: true });
  (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(["conf"]);
  useJourney.getState().set({ sensors: { mic: false, cam: false, gps: false, ble: false } });
});

// A1: a stop() that lands while start() is awaiting model provisioning must win —
// the resumed start() must not load Vosk, register subs, or flip mic back on.
test("A1: stop() during provisioning aborts the resumed start — mic off, Vosk never starts", async () => {
  let resolveInfo!: (v: any) => void;
  const infoP = new Promise((res) => { resolveInfo = res; });
  (FileSystem.getInfoAsync as jest.Mock).mockReturnValue(infoP);
  const startP = audio.start(() => {});
  await Promise.resolve(); // let secureWords.get / Promise.all settle
  await audio.stop();
  resolveInfo({ exists: true, isDirectory: true });
  await startP;
  expect(Vosk.start as jest.Mock).not.toHaveBeenCalled();
  expect(Vosk.loadModel as jest.Mock).not.toHaveBeenCalled();
  expect(useJourney.getState().sensors.mic).toBe(false);
});

// A2: if Vosk.start rejects after loadModel succeeded, the half-armed engine must
// be unwound (subs removed, model unloaded) before the catch starts the STT
// fallback — otherwise two engines fight over the mic.
test("A2: Vosk.start failure unwinds vosk and starts the STT fallback exactly once", async () => {
  (Vosk.start as jest.Mock).mockRejectedValueOnce(new Error("vosk start boom"));
  await audio.start(() => {});
  expect(Vosk.unload as jest.Mock).toHaveBeenCalled();
  const voskSubRemoves = [Vosk.onResult, Vosk.onPartialResult, Vosk.onError].map(
    (fn) => (fn as jest.Mock).mock.results.at(-1)!.value.remove
  );
  for (const remove of voskSubRemoves) expect(remove).toHaveBeenCalled();
  expect(ExpoSpeechRecognitionModule.start as jest.Mock).toHaveBeenCalledTimes(1);
  await audio.stop();
});

// A6: a model dir that exists but is empty (a prior unzip failed) must NOT count as
// provisioned — the download/unzip path has to run instead of returning an empty dir.
test("A6: an empty existing model dir does not short-circuit — download path runs", async () => {
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, isDirectory: true });
  (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([]); // no `conf` entry
  await audio.start(() => {});
  expect(FileSystem.downloadAsync as jest.Mock).toHaveBeenCalled();
  await audio.stop();
});

// D11: on a FRESH install the model dir does not exist, so downloadAsync targets
// <doc>/vosk/en.zip whose parent <doc>/vosk was never created → "Directory doesn't
// exist" and every new user falls back to stt_only (wake words dead). The parent
// dir must be created (intermediates) BEFORE the download.
test("D11: fresh install creates the vosk dir before downloading the model", async () => {
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false, isDirectory: false });
  await audio.start(() => {});
  expect(FileSystem.makeDirectoryAsync as jest.Mock).toHaveBeenCalledWith(
    "file:///doc/vosk",
    { intermediates: true }
  );
  const mkOrder = (FileSystem.makeDirectoryAsync as jest.Mock).mock.invocationCallOrder[0];
  const dlOrder = (FileSystem.downloadAsync as jest.Mock).mock.invocationCallOrder[0];
  expect(mkOrder).toBeLessThan(dlOrder); // dir created first, then download
  await audio.stop();
});

// A7: partial and final transcripts both carry the same utterance, so route() must
// not fire the same keyword class twice in quick succession. 3 s dedup per kind.
test("A7: the same keyword within 3 s fires once; after 3 s it fires again", () => {
  const onKeyword = jest.fn();
  const words = { emergency: ["mango"], safe: [] as string[], police: [] as string[] };
  route("mango", onKeyword, words, 0);
  route("mango", onKeyword, words, 100); // 100 ms later — deduped
  expect(onKeyword).toHaveBeenCalledTimes(1);
  route("mango", onKeyword, words, 3600); // 3.6 s later — fires again
  expect(onKeyword).toHaveBeenCalledTimes(2);
});

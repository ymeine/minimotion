import { DEMOS } from "../../demo/samples";
import mockPlayer from "../../demo/player.svelte";
import { reset, TickerPlayer } from "../fixtures";
import { createGetElementName } from "./elementName";
jest.mock("../../demo/player.svelte", () => jest.requireActual("./mockPlayer"));

describe("samples", () => {
  function createSampleInstance(sample) {
    const dom = document.createElement("div");
    document.body.appendChild(dom);
    let instance;
    try {
      instance = new sample.default({
        target: dom
      });
    } catch (error) {
      document.body.removeChild(dom);
      throw error;
    }
    function destroy() {
      try {
        instance.$destroy();
      } finally {
        document.body.removeChild(dom);
      }
    }
    return { dom, instance, destroy };
  }

  const createDemoTest = sample => async () => {
    reset();
    const operations: string[] = [];
    let tickMutations: MutationRecord[] = [];
    const { dom, destroy } = createSampleInstance(sample);
    const getElementName = createGetElementName(dom);
    const mutationObserver = new MutationObserver(mutations =>
      tickMutations.push(...mutations)
    );
    try {
      expect(mockPlayer.instances).toHaveLength(1);
      mutationObserver.observe(dom, {
        subtree: true,
        attributes: true
      });
      const animation = mockPlayer.instances[0].animation;
      const player = new TickerPlayer(animation);
      await player.play({
        onupdate: time => {
          const tick = time / 16;
          const newOperations: string[] = [];
          tickMutations.forEach(mutation => {
            if (mutation.type == "attributes") {
              const target = mutation.target as HTMLElement;
              const targetName = getElementName(target);
              const attributeName = mutation.attributeName!;
              newOperations.push(
                `${tick}: ${targetName} ${attributeName}=${JSON.stringify(
                  target.getAttribute(attributeName)
                )}`
              );
            }
          });
          newOperations.sort();
          let lastOperation = "";
          for (const operation of newOperations) {
            if (operation !== lastOperation) {
              operations.push(operation);
            }
            lastOperation = operation;
          }
          tickMutations = [];
        }
      });
    } finally {
      mutationObserver.disconnect();
      destroy();
    }
    expect(operations).not.toHaveLength(0);
    expect(operations).toMatchSnapshot("animation");
  };

  DEMOS.forEach(demo => {
    if (demo.type !== "category") {
      it(demo.title, createDemoTest(demo.sample));
    }
  });
});

import { useEffect, useMemo, useRef, useState } from "react";
import { ChatHistoryItemWithMessageId } from "../../redux/slices/sessionSlice";

/**
 * Only reset scroll state when a new user message is added to the chat.
 * We don't want to auto-scroll on new tool response messages.
 */
function getNumUserMsgs(history: ChatHistoryItemWithMessageId[]) {
  return history.filter((msg) => msg.message.role === "user").length;
}

// Threshold in pixels for determining if user is "at bottom"
// Using a larger value to account for browser rendering differences and be more forgiving
const AT_BOTTOM_THRESHOLD = 50;

export const useAutoScroll = (
  ref: React.RefObject<HTMLDivElement>,
  history: ChatHistoryItemWithMessageId[],
) => {
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const numUserMsgs = useMemo(() => getNumUserMsgs(history), [history.length]);

  // Use refs to avoid recreating observers when these values change
  const userHasScrolledRef = useRef(userHasScrolled);
  const isProgrammaticScrollRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    userHasScrolledRef.current = userHasScrolled;
  }, [userHasScrolled]);

  // Reset scroll state when a new user message is added
  useEffect(() => {
    setUserHasScrolled(false);
    userHasScrolledRef.current = false;
  }, [numUserMsgs]);

  useEffect(() => {
    if (!ref.current || history.length === 0) return;

    const elem = ref.current;
    const observedElements = new WeakSet<Element>();

    /**
     * Scrolls to bottom with requestAnimationFrame for smooth scrolling.
     * Sets a flag to prevent this scroll from being detected as user scroll.
     */
    const scrollToBottom = () => {
      if (!elem || userHasScrolledRef.current) return;

      isProgrammaticScrollRef.current = true;
      requestAnimationFrame(() => {
        elem.scrollTop = elem.scrollHeight;
        // Reset flag after a short delay to allow scroll event to fire first
        requestAnimationFrame(() => {
          isProgrammaticScrollRef.current = false;
        });
      });
    };

    /**
     * Handles scroll events to detect user scrolling.
     * Ignores programmatic scrolls triggered by scrollToBottom().
     */
    const handleScroll = () => {
      if (!elem) return;

      // Ignore scrolls we triggered programmatically
      if (isProgrammaticScrollRef.current) return;

      const distanceFromBottom =
        elem.scrollHeight - elem.scrollTop - elem.clientHeight;
      const isAtBottom = distanceFromBottom < AT_BOTTOM_THRESHOLD;

      /**
       * We stop auto scrolling if a user manually scrolled up.
       * We resume auto scrolling if a user manually scrolled to the bottom.
       */
      setUserHasScrolled(!isAtBottom);
    };

    /**
     * ResizeObserver triggers on any size change in observed elements.
     */
    const resizeObserver = new ResizeObserver(() => {
      scrollToBottom();
    });

    /**
     * Observes an element for resize events.
     * Uses WeakSet to avoid observing the same element multiple times.
     */
    const observeElement = (element: Element) => {
      if (observedElements.has(element)) return;
      observedElements.add(element);
      resizeObserver.observe(element);
    };

    /**
     * Recursively observes all child elements.
     * This ensures tool call blocks and their nested content are tracked.
     */
    const observeAllDescendants = (root: Element) => {
      observeElement(root);
      Array.from(root.children).forEach((child) => {
        observeAllDescendants(child);
      });
    };

    /**
     * MutationObserver to track DOM changes:
     * - New elements added (e.g., tool call blocks, tool outputs)
     * - This handles CSS transitions by detecting when new elements appear
     */
    const mutationObserver = new MutationObserver((mutations) => {
      let shouldScroll = false;

      for (const mutation of mutations) {
        // Track newly added elements
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) {
              observeAllDescendants(node);
              shouldScroll = true;
            }
          });
        }
      }

      // Scroll when new elements are added (e.g., tool call starts/completes)
      if (shouldScroll) {
        scrollToBottom();
      }
    });

    // Start observing
    elem.addEventListener("scroll", handleScroll, { passive: true });
    observeAllDescendants(elem);
    mutationObserver.observe(elem, {
      childList: true,
      subtree: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      elem?.removeEventListener("scroll", handleScroll);
    };
    // Note: userHasScrolled is NOT in dependencies - we use ref instead
    // This prevents observer recreation on every scroll state change
  }, [ref, history.length]);
};

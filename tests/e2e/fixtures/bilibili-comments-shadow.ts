export const BILIBILI_MAIN_COMMENT_TEXT = 'Main comment rich text for browser capture';
export const BILIBILI_REPLY_COMMENT_TEXT = 'Reply @reply-user nested rich text';
export const BILIBILI_UNRELATED_SHADOW_TEXT = BILIBILI_MAIN_COMMENT_TEXT;

export function buildBilibiliCommentsShadowFixture(): string {
  return `
    <bili-comments data-fixture="comments"></bili-comments>
    <script>
      window.__bilibiliFixtureCounters = {
        commentsRoot: 0,
        threadRoot: 0,
        commentRoot: 0,
        replyRoot: 0,
        richTextRoot: 0,
        unrelatedRoot: 0,
        shadowListenerAdds: {},
        shadowListenerRemoves: {},
        highlightInsertions: {}
      };

      if (!window.__bilibiliFixtureShadowListenerProbeInstalled) {
        window.__bilibiliFixtureShadowListenerProbeInstalled = true;
        const originalAddEventListener = ShadowRoot.prototype.addEventListener;
        const originalRemoveEventListener = ShadowRoot.prototype.removeEventListener;
        const readFixtureKey = (root) => {
          const host = root.host;
          return host instanceof HTMLElement ? host.dataset.fixture || null : null;
        };
        const bumpCounter = (bucket, key) => {
          bucket[key] = (bucket[key] || 0) + 1;
        };
        Object.defineProperty(ShadowRoot.prototype, 'addEventListener', {
          configurable: true,
          value: function addEventListener(type, listener, options) {
            const fixtureKey = readFixtureKey(this);
            if (fixtureKey) {
              bumpCounter(window.__bilibiliFixtureCounters.shadowListenerAdds, fixtureKey + ':' + type);
            }
            return originalAddEventListener.call(this, type, listener, options);
          }
        });
        Object.defineProperty(ShadowRoot.prototype, 'removeEventListener', {
          configurable: true,
          value: function removeEventListener(type, listener, options) {
            const fixtureKey = readFixtureKey(this);
            if (fixtureKey) {
              bumpCounter(window.__bilibiliFixtureCounters.shadowListenerRemoves, fixtureKey + ':' + type);
            }
            return originalRemoveEventListener.call(this, type, listener, options);
          }
        });
      }

      const comments = document.querySelector('bili-comments[data-fixture="comments"]');
      const commentsRoot = comments.attachShadow({ mode: 'open' });
      window.__bilibiliFixtureCounters.commentsRoot += 1;
      commentsRoot.innerHTML = '<div id="contents"></div><div id="continuations"></div>';
      const contents = commentsRoot.querySelector('#contents');

      function observeHighlightInsertions(fixtureId, root) {
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
              if (!(node instanceof Element)) {
                return;
              }
              const markCount =
                (node.matches('mark[data-video-fragment-id]') ? 1 : 0) +
                node.querySelectorAll('mark[data-video-fragment-id]').length;
              if (markCount > 0) {
                window.__bilibiliFixtureCounters.highlightInsertions[fixtureId] =
                  (window.__bilibiliFixtureCounters.highlightInsertions[fixtureId] || 0) + markCount;
              }
            });
          }
        });
        observer.observe(root, { childList: true, subtree: true });
      }

      function attachOpenRoot(host, key, html) {
        const root = host.attachShadow({ mode: 'open' });
        window.__bilibiliFixtureCounters[key] += 1;
        root.innerHTML = html;
        return root;
      }

      function createRichText(fixtureId, html) {
        const richText = document.createElement('bili-rich-text');
        richText.dataset.fixture = fixtureId;
        const root = attachOpenRoot(
          richText,
          'richTextRoot',
          '<div id="contents" class="rich-text-content">' + html + '</div>'
        );
        observeHighlightInsertions(fixtureId, root);
        return richText;
      }

      function createUnrelatedShadowHost() {
        const host = document.createElement('x-unrelated-shadow-host');
        host.dataset.fixture = 'unrelated-shadow-host';
        const root = attachOpenRoot(
          host,
          'unrelatedRoot',
          '<div class="shadow-noise"><span>${BILIBILI_UNRELATED_SHADOW_TEXT}</span></div>'
        );
        observeHighlightInsertions('unrelated-shadow-host', root);
        return host;
      }

      function createMainComment() {
        const mainComment = document.createElement('bili-comment-renderer');
        mainComment.dataset.fixture = 'main-comment';
        const mainRoot = attachOpenRoot(
          mainComment,
          'commentRoot',
          '<div class="comment-main"></div>'
        );
        mainRoot.querySelector('.comment-main').append(
          createRichText('main-rich-text', '<span>${BILIBILI_MAIN_COMMENT_TEXT}</span>')
        );
        return mainComment;
      }

      function createReplyComment() {
        const reply = document.createElement('bili-comment-reply-renderer');
        reply.dataset.fixture = 'reply-comment';
        const replyRoot = attachOpenRoot(reply, 'replyRoot', '<div class="comment-reply"></div>');
        replyRoot.querySelector('.comment-reply').append(
          createRichText(
            'reply-rich-text',
            '<span>Reply </span><a href="//space.bilibili.com/123" data-type="mention">@reply-user</a><span> nested rich text</span>'
          )
        );
        return reply;
      }

      const thread = document.createElement('bili-comment-thread-renderer');
      thread.dataset.fixture = 'thread';
      const threadRoot = attachOpenRoot(thread, 'threadRoot', '<div class="comment-thread"></div>');
      const threadBody = threadRoot.querySelector('.comment-thread');

      function renderThreadContents() {
        threadBody.replaceChildren(createUnrelatedShadowHost(), createMainComment(), createReplyComment());
      }

      renderThreadContents();
      contents.append(thread);

      window.__rerenderBilibiliMainCommentForTests = () => {
        const findFixtureHost = (root, fixtureId) => {
          const direct = root.querySelector('[data-fixture="' + fixtureId + '"]');
          if (direct) {
            return direct;
          }
          const elements = Array.from(root.querySelectorAll('*'));
          for (const element of elements) {
            if (!element.shadowRoot) {
              continue;
            }
            const nested = findFixtureHost(element.shadowRoot, fixtureId);
            if (nested) {
              return nested;
            }
          }
          return null;
        };
        const mainRichText = findFixtureHost(document, 'main-rich-text');
        const mainContent = mainRichText?.shadowRoot?.querySelector('#contents');
        if (mainContent) {
          mainContent.innerHTML = '<span>${BILIBILI_MAIN_COMMENT_TEXT}</span>';
        }
      };
    </script>`;
}

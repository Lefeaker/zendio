export const BILIBILI_MAIN_COMMENT_TEXT = 'Main comment rich text for browser capture';
export const BILIBILI_REPLY_COMMENT_TEXT = 'Reply @reply-user nested rich text';

export function buildBilibiliCommentsShadowFixture(): string {
  return `
    <bili-comments data-fixture="comments"></bili-comments>
    <script>
      window.__bilibiliFixtureCounters = {
        commentsRoot: 0,
        threadRoot: 0,
        commentRoot: 0,
        replyRoot: 0,
        richTextRoot: 0
      };

      const comments = document.querySelector('bili-comments[data-fixture="comments"]');
      const commentsRoot = comments.attachShadow({ mode: 'open' });
      window.__bilibiliFixtureCounters.commentsRoot += 1;
      commentsRoot.innerHTML = '<div id="contents"></div><div id="continuations"></div>';
      const contents = commentsRoot.querySelector('#contents');

      function attachOpenRoot(host, key, html) {
        const root = host.attachShadow({ mode: 'open' });
        window.__bilibiliFixtureCounters[key] += 1;
        root.innerHTML = html;
        return root;
      }

      function createRichText(fixtureId, html) {
        const richText = document.createElement('bili-rich-text');
        richText.dataset.fixture = fixtureId;
        attachOpenRoot(
          richText,
          'richTextRoot',
          '<div id="contents" class="rich-text-content">' + html + '</div>'
        );
        return richText;
      }

      const thread = document.createElement('bili-comment-thread-renderer');
      thread.dataset.fixture = 'thread';
      const threadRoot = attachOpenRoot(thread, 'threadRoot', '<div class="comment-thread"></div>');
      const threadBody = threadRoot.querySelector('.comment-thread');

      const mainComment = document.createElement('bili-comment-renderer');
      mainComment.dataset.fixture = 'main-comment';
      const mainRoot = attachOpenRoot(mainComment, 'commentRoot', '<div class="comment-main"></div>');
      mainRoot.querySelector('.comment-main').append(
        createRichText('main-rich-text', '<span>${BILIBILI_MAIN_COMMENT_TEXT}</span>')
      );

      const reply = document.createElement('bili-comment-reply-renderer');
      reply.dataset.fixture = 'reply-comment';
      const replyRoot = attachOpenRoot(reply, 'replyRoot', '<div class="comment-reply"></div>');
      replyRoot.querySelector('.comment-reply').append(
        createRichText(
          'reply-rich-text',
          '<span>Reply </span><a href="//space.bilibili.com/123" data-type="mention">@reply-user</a><span> nested rich text</span>'
        )
      );

      threadBody.append(mainComment, reply);
      contents.append(thread);
    </script>`;
}

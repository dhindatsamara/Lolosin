import { useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteComment,
  DISCUSSION_BODY_MAX,
  fetchDiscussion,
  formatRelativeTime,
  getDiscussionViewer,
  postComment,
  postReply,
  type Comment,
  type DiscussionViewer,
} from '../../lib/discussions'
import { Button } from '../ui/Button'
import { ConfirmModal } from './ConfirmModal'

export interface DiscussionThreadProps {
  /** Id soal yang didiskusikan (kolom question_id). */
  questionId: string
  /**
   * Bila true, thread mulai tertutup (tombol "Lihat diskusi") dan
   * BARU memuat data saat dibuka. Dipakai di halaman hasil tryout
   * (110 soal) supaya tidak memicu 110 query sekaligus saat mount.
   * Default false: langsung terbuka + muat (dipakai Latihan).
   */
  mulaiTertutup?: boolean
}

const TEXTAREA_CLASS =
  'w-full resize-y rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm font-medium outline-none placeholder:text-ink/60 focus:border-primary-600 focus:ring-2 focus:ring-primary-100'

/**
 * Thread diskusi di bawah pembahasan tiap soal: daftar komentar +
 * balasan satu tingkat.
 *
 * - Tamu bisa membaca; form tulis diganti ajakan login.
 * - User login bisa tulis komentar, balas komentar utama (balasan
 *   tidak bisa dibalas lagi), dan hapus komentar sendiri.
 * - Dhinda bisa hapus komentar siapa pun.
 * - Setelah kirim/hapus, thread dimuat ulang dari server (tanpa
 *   optimistic update, supaya tidak ada duplikat).
 * - Tidak ada konten palsu: state kosong memakai kalimat jujur.
 */
export function DiscussionThread({
  questionId,
  mulaiTertutup = false,
}: DiscussionThreadProps) {
  const composerId = useId()
  const replyId = useId()
  // Bila mulai tertutup, data baru dimuat saat user membuka thread.
  const [terbuka, setTerbuka] = useState(!mulaiTertutup)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [viewer, setViewer] = useState<DiscussionViewer | null>(null)
  const [composer, setComposer] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState<'comment' | 'reply' | null>(
    null,
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Comment | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const [result, currentViewer] = await Promise.all([
      fetchDiscussion(questionId),
      getDiscussionViewer(),
    ])
    setViewer(currentViewer)
    if (result.ok) {
      setComments(result.comments)
    } else {
      setLoadError(result.error ?? 'Diskusi gagal dimuat. Coba lagi ya.')
    }
    setLoading(false)
  }, [questionId])

  useEffect(() => {
    // Thread tertutup tidak memuat apa pun sampai dibuka.
    if (!terbuka) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    Promise.all([fetchDiscussion(questionId), getDiscussionViewer()]).then(
      ([result, currentViewer]) => {
        if (cancelled) return
        setViewer(currentViewer)
        if (result.ok) {
          setComments(result.comments)
        } else {
          setLoadError(result.error ?? 'Diskusi gagal dimuat. Coba lagi ya.')
        }
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [questionId, terbuka])

  /** True bila viewer boleh hapus komentar ini (penulis atau Dhinda). */
  function canDelete(comment: Comment): boolean {
    if (!viewer) return false
    return viewer.isDev || viewer.userId === comment.userId
  }

  async function handleSubmitComment() {
    if (submitting) return
    setFormError(null)
    setSubmitting('comment')
    const result = await postComment(questionId, composer)
    setSubmitting(null)
    if (!result.ok) {
      setFormError(result.error ?? 'Komentar gagal dikirim. Coba lagi ya.')
      return
    }
    setComposer('')
    await load()
  }

  async function handleSubmitReply(parentId: string) {
    if (submitting) return
    setFormError(null)
    setSubmitting('reply')
    const result = await postReply(questionId, parentId, replyText)
    setSubmitting(null)
    if (!result.ok) {
      setFormError(result.error ?? 'Balasan gagal dikirim. Coba lagi ya.')
      return
    }
    setReplyText('')
    setReplyTo(null)
    await load()
  }

  async function handleConfirmDelete() {
    if (!confirmDelete || deleting) return
    setDeleting(true)
    const result = await deleteComment(confirmDelete.id)
    setDeleting(false)
    setConfirmDelete(null)
    if (!result.ok) {
      setFormError(result.error ?? 'Komentar gagal dihapus. Coba lagi ya.')
      return
    }
    await load()
  }

  const totalCount = comments.reduce(
    (sum, comment) => sum + 1 + comment.replies.length,
    0,
  )

  // Mode tertutup (halaman hasil tryout): hanya tombol, tanpa query.
  if (mulaiTertutup && !terbuka) {
    return (
      <section
        aria-label="Diskusi soal ini"
        className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft"
      >
        <h3 className="font-display text-base font-extrabold">Diskusi</h3>
        <Button size="sm" variant="secondary" onClick={() => setTerbuka(true)}>
          Lihat diskusi
        </Button>
      </section>
    )
  }

  return (
    <section
      aria-label="Diskusi soal ini"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft"
    >
      <div className="flex items-center gap-2">
        <h3 className="font-display text-base font-extrabold">Diskusi</h3>
        {totalCount > 0 && (
          <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-extrabold text-primary-700">
            {totalCount}
          </span>
        )}
        {mulaiTertutup && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTerbuka(false)}
            className="ml-auto"
          >
            Tutup
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-ink/60">Memuat diskusi...</p>
      ) : loadError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm leading-relaxed text-ink/70">{loadError}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void load()}
          >
            Coba lagi
          </Button>
        </div>
      ) : (
        <>
          {comments.length === 0 ? (
            <p className="text-sm leading-relaxed text-ink/60">
              Belum ada diskusi untuk soal ini. Jadilah yang pertama bertanya.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {comments.map((comment) => (
                <li key={comment.id} className="flex flex-col gap-2">
                  <CommentItem
                    comment={comment}
                    viewer={viewer}
                    showReply={replyTo !== comment.id}
                    onReply={() => {
                      setReplyTo(comment.id)
                      setReplyText('')
                      setFormError(null)
                    }}
                    onDelete={
                      canDelete(comment)
                        ? () => setConfirmDelete(comment)
                        : undefined
                    }
                  />
                  {comment.replies.length > 0 && (
                    <ul className="ml-5 flex flex-col gap-3 border-l-2 border-line pl-4">
                      {comment.replies.map((reply) => (
                        <li key={reply.id}>
                          <CommentItem
                            comment={reply}
                            viewer={viewer}
                            showReply={false}
                            onDelete={
                              canDelete(reply)
                                ? () => setConfirmDelete(reply)
                                : undefined
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  {replyTo === comment.id && viewer && (
                    <div className="ml-5 flex flex-col gap-2 border-l-2 border-line pl-4">
                      <label
                        htmlFor={replyId}
                        className="text-xs font-bold text-ink/60"
                      >
                        Balas {comment.username}
                      </label>
                      <textarea
                        id={replyId}
                        value={replyText}
                        onChange={(event) =>
                          setReplyText(
                            event.target.value.slice(0, DISCUSSION_BODY_MAX),
                          )
                        }
                        rows={3}
                        maxLength={DISCUSSION_BODY_MAX}
                        placeholder="Tulis balasanmu..."
                        className={TEXTAREA_CLASS}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-ink/60">
                          {replyText.length}/{DISCUSSION_BODY_MAX}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReplyTo(null)
                              setReplyText('')
                            }}
                          >
                            Batal
                          </Button>
                          <Button
                            size="sm"
                            disabled={
                              replyText.trim() === '' ||
                              submitting !== null
                            }
                            onClick={() => void handleSubmitReply(comment.id)}
                          >
                            {submitting === 'reply'
                              ? 'Mengirim...'
                              : 'Kirim balasan'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {formError && (
            <p role="alert" className="text-sm font-semibold text-red-700">
              {formError}
            </p>
          )}

          {viewer ? (
            <div className="flex flex-col gap-2 border-t border-dashed border-line-strong pt-3">
              <label
                htmlFor={composerId}
                className="text-xs font-extrabold tracking-wide text-ink/60 uppercase"
              >
                Tulis komentar
              </label>
              <textarea
                id={composerId}
                value={composer}
                onChange={(event) =>
                  setComposer(
                    event.target.value.slice(0, DISCUSSION_BODY_MAX),
                  )
                }
                rows={3}
                maxLength={DISCUSSION_BODY_MAX}
                placeholder="Masih bingung di bagian mana? Tanya di sini."
                className={TEXTAREA_CLASS}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink/60">
                  {composer.length}/{DISCUSSION_BODY_MAX}
                </span>
                <Button
                  size="sm"
                  disabled={composer.trim() === '' || submitting !== null}
                  onClick={() => void handleSubmitComment()}
                >
                  {submitting === 'comment' ? 'Mengirim...' : 'Kirim'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2 rounded-xl bg-paper px-3 py-2.5">
              <p className="text-sm leading-relaxed font-medium text-ink/70">
                Punya pertanyaan soal soal ini? Login dulu biar bisa ikut
                diskusi.
              </p>
              <Link to="/auth">
                <Button size="sm">Login untuk ikut diskusi</Button>
              </Link>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={confirmDelete !== null}
        title="Hapus komentar ini?"
        body="Komentar yang dihapus tidak bisa dikembalikan. Balasannya ikut terhapus juga."
        confirmLabel={deleting ? 'Menghapus...' : 'Hapus'}
        cancelLabel="Batalkan"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if (!deleting) setConfirmDelete(null)
        }}
      />
    </section>
  )
}

interface CommentItemProps {
  comment: Comment
  viewer: DiscussionViewer | null
  /** Tampilkan tombol Balas (hanya komentar utama, hanya user login). */
  showReply: boolean
  onReply?: () => void
  /** Bila tidak diisi, tombol Hapus tidak tampil. */
  onDelete?: () => void
}

/** Satu komentar atau balasan: avatar inisial, nama, waktu, isi, aksi. */
function CommentItem({
  comment,
  viewer,
  showReply,
  onReply,
  onDelete,
}: CommentItemProps) {
  const initial = (comment.username.charAt(0) || 'P').toUpperCase()
  return (
    <article className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-extrabold text-primary-700"
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-bold">{comment.username}</span>
          <span className="text-xs font-semibold text-ink/60">
            {formatRelativeTime(comment.createdAt)}
          </span>
        </p>
        <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-line text-ink/80">
          {comment.body}
        </p>
        <div className="mt-1 flex gap-3">
          {viewer && showReply && onReply && (
            <button
              type="button"
              onClick={onReply}
              className="text-xs font-bold text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
            >
              Balas
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs font-bold text-red-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
            >
              Hapus
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

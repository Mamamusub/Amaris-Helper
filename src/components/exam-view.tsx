"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { Subject } from "@/lib/types";
import styles from "./exam-view.module.css";
import { EXAM_KEY, CHECKLIST_KEY, EXAM_CHANGED, readExamData, type ExamInfo, type ExamMap, type ChecklistMap } from "@/lib/exam-storage";

type Props = {
  subjects: Subject[];
  initialSubjectId?: string;
};

type StoredFile = {
  id: string;
  subjectId: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  blob: Blob;
};

const DB_NAME = "amaris-exam-files";
const STORE_NAME = "files";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
        });

        store.createIndex("subjectId", "subjectId");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredFiles(): Promise<StoredFile[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result as StoredFile[]);
      db.close();
    };

    request.onerror = () => {
      reject(request.error);
      db.close();
    };
  });
}

async function saveStoredFile(file: StoredFile) {
  const db = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");

    transaction.objectStore(STORE_NAME).put(file);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function removeStoredFile(id: string) {
  const db = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");

    transaction.objectStore(STORE_NAME).delete(id);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function localDate(date: string) {
  if (!date) return null;

  const [year, month, day] = date.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function daysUntil(date: string) {
  const exam = localDate(date);

  if (!exam) return null;

  const today = new Date();

  today.setHours(0, 0, 0, 0);
  exam.setHours(0, 0, 0, 0);

  return Math.ceil(
    (exam.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ExamView({ subjects, initialSubjectId }: Props) {
  const [examInfo, setExamInfo] = useState<ExamMap>({});
  const [checklists, setChecklists] = useState<ChecklistMap>({});

  const [selectedSubjectId, setSelectedSubjectId] =
    useState<string>(initialSubjectId ?? "");

  const [newChecklistItem, setNewChecklistItem] = useState("");

  const [files, setFiles] = useState<StoredFile[]>([]);

  const [currentMonth, setCurrentMonth] =
    useState(() => new Date());

useEffect(() => {
  const data = readExamData(localStorage);
  setExamInfo(data.exams);
  setChecklists(data.checklists);

  getStoredFiles()
    .then(setFiles)
    .catch(console.error);
}, []);

  useEffect(() => {
    if (!selectedSubjectId && subjects.length) {
      setSelectedSubjectId(subjects[0].id);
    }
  }, [subjects, selectedSubjectId]);

  function saveExamInfo(next: ExamMap) {
    setExamInfo(next);
    localStorage.setItem(EXAM_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EXAM_CHANGED));
  }

  function saveChecklist(next: ChecklistMap) {
    setChecklists(next);

    localStorage.setItem(
      CHECKLIST_KEY,
      JSON.stringify(next)
    );
    window.dispatchEvent(new Event(EXAM_CHANGED));
  }

  const selectedSubject =
    subjects.find(
      (subject) => subject.id === selectedSubjectId
    ) ?? subjects[0];

    const upcomingExams = useMemo(() => {
    return subjects
        .flatMap((subject) =>
        (examInfo[subject.id] ?? []).map((exam) => ({
            subject,
            exam,
        }))
        )
        .filter(({ exam }) => {
        if (!exam.date) return false;

        const remaining = daysUntil(exam.date);

        return remaining !== null && remaining >= 0;
        })
        .sort((a, b) =>
        a.exam.date.localeCompare(b.exam.date)
        );
    }, [subjects, examInfo]);

function addExam(subjectId: string) {
  const newExam: ExamInfo = {
    id: crypto.randomUUID(),
    date: "",
    time: "",
    room: "",
    type: "Quiz",
    calendarName: "",
  };

  saveExamInfo({
    ...examInfo,
    [subjectId]: [
      ...(examInfo[subjectId] ?? []),
      newExam,
    ],
  });
}

function updateExam(
  subjectId: string,
  examId: string,
  field: keyof Omit<ExamInfo, "id">,
  value: string
) {
  saveExamInfo({
    ...examInfo,

    [subjectId]: (examInfo[subjectId] ?? []).map((exam) =>
      exam.id === examId
        ? {
            ...exam,
            [field]: value,
          }
        : exam
    ),
  });
}

function deleteExam(
  subjectId: string,
  examId: string
) {
  saveExamInfo({
    ...examInfo,

    [subjectId]: (examInfo[subjectId] ?? []).filter(
      (exam) => exam.id !== examId
    ),
  });
}
  function addChecklistItem(event: FormEvent) {
    event.preventDefault();

    if (
      !selectedSubject ||
      !newChecklistItem.trim()
    ) {
      return;
    }

    const current =
      checklists[selectedSubject.id] ?? [];

    const next = {
      ...checklists,
      [selectedSubject.id]: [
        ...current,
        {
          id: crypto.randomUUID(),
          text: newChecklistItem.trim(),
          done: false,
        },
      ],
    };

    saveChecklist(next);
    setNewChecklistItem("");
  }

  function toggleChecklistItem(id: string) {
    if (!selectedSubject) return;

    const current =
      checklists[selectedSubject.id] ?? [];

    saveChecklist({
      ...checklists,
      [selectedSubject.id]: current.map((item) =>
        item.id === id
          ? { ...item, done: !item.done, doneAt: item.done ? undefined : new Date().toISOString() }
          : item
      ),
    });
  }

  function deleteChecklistItem(id: string) {
    if (!selectedSubject) return;

    saveChecklist({
      ...checklists,
      [selectedSubject.id]: (
        checklists[selectedSubject.id] ?? []
      ).filter((item) => item.id !== id),
    });
  }

  async function uploadFiles(
    event: ChangeEvent<HTMLInputElement>
  ) {
    if (!selectedSubject) return;

    const selectedFiles = Array.from(
      event.target.files ?? []
    );

    for (const file of selectedFiles) {
      const storedFile: StoredFile = {
        id: crypto.randomUUID(),
        subjectId: selectedSubject.id,
        name: file.name,
        type: file.type,
        size: file.size,
        createdAt: new Date().toISOString(),
        blob: file,
      };

      await saveStoredFile(storedFile);

      setFiles((current) => [
        ...current,
        storedFile,
      ]);
    }

    event.target.value = "";
  }

  async function deleteFile(id: string) {
    await removeStoredFile(id);

    setFiles((current) =>
      current.filter((file) => file.id !== id)
    );
  }

  function openFile(file: StoredFile) {
    const url = URL.createObjectURL(file.blob);

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
  }

  const checklist = selectedSubject
    ? checklists[selectedSubject.id] ?? []
    : [];

  const selectedFiles = selectedSubject
    ? files.filter(
        (file) =>
          file.subjectId === selectedSubject.id
      )
    : [];

  const completed =
    checklist.filter((item) => item.done).length;

  const progress = checklist.length
    ? Math.round(
        (completed / checklist.length) * 100
      )
    : 0;

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(
    year,
    month,
    1
  ).getDay();

  const daysInMonth = new Date(
    year,
    month + 1,
    0
  ).getDate();

  const calendarCells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => index + 1
    ),
  ];

  while (calendarCells.length % 7 !== 0) {
    calendarCells.push(null);
  }

  function dateKey(day: number) {
    return [
      year,
      String(month + 1).padStart(2, "0"),
      String(day).padStart(2, "0"),
    ].join("-");
  }

  if (!subjects.length) {
    return (
      <div className="content">
        <section className="panel">
          <h3>No subjects yet</h3>

          <p className="empty-state">
            Add subjects in Study first.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="view-intro compact">
        <div>
          <span className="section-kicker">
            EXAM WORKSPACE
          </span>

          <h2>
            Prepare with
            <br />
            <em>less chaos.</em>
          </h2>
        </div>

        <p>
          Exam dates, study checklist and course
          files in one place.
        </p>
      </div>

      <div className={styles.topGrid}>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                EXAM CALENDAR
              </span>

              <h3>
                {currentMonth.toLocaleString(
                  "en-US",
                  {
                    month: "long",
                    year: "numeric",
                  }
                )}
              </h3>
            </div>

            <div className={styles.calendarButtons}>
              <button
                className="secondary-button"
                onClick={() =>
                  setCurrentMonth(
                    new Date(year, month - 1, 1)
                  )
                }
              >
                ←
              </button>

              <button
                className="secondary-button"
                onClick={() =>
                  setCurrentMonth(new Date())
                }
              >
                Today
              </button>

              <button
                className="secondary-button"
                onClick={() =>
                  setCurrentMonth(
                    new Date(year, month + 1, 1)
                  )
                }
              >
                →
              </button>
            </div>
          </div>

          <div className={styles.weekDays}>
            {[
              "Sun",
              "Mon",
              "Tue",
              "Wed",
              "Thu",
              "Fri",
              "Sat",
            ].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className={styles.calendar}>
            {calendarCells.map(
              (day, index) => {
                if (!day) {
                  return (
                    <div
                      key={`empty-${index}`}
                      className={
                        styles.emptyCalendarDay
                      }
                    />
                  );
                }

                const key = dateKey(day);

                const examsToday = subjects.flatMap((subject) =>
                    (examInfo[subject.id] ?? [])
                        .filter((exam) => exam.date === key)
                        .map((exam) => ({
                        subject,
                        exam,
                        }))
                    );

                return (
                  <div
                    key={key}
                    className={
                      styles.calendarDay
                    }
                  >
                    <span>{day}</span>

                    {examsToday.map(({ subject, exam }) => (
                        <button
                            key={exam.id}
                            onClick={() =>
                            setSelectedSubjectId(subject.id)
                            }
                            className={styles.calendarExam}
                            style={{
                            borderLeftColor: subject.color,
                            }}
                        >
                            {exam.calendarName?.trim() ||
                            `${subject.name} · ${exam.type}`}
                        </button>
                        ))}
                  </div>
                );
              }
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                COMING SOON
              </span>

              <h3>Upcoming exams</h3>
            </div>

            <span className={styles.count}>
              {upcomingExams.length}
            </span>
          </div>

          <div className={styles.upcomingList}>
            {upcomingExams.map(({ subject, exam }) => {
                const remaining = daysUntil(exam.date);

                return (
                    <button
                    key={exam.id}
                    className={styles.upcomingExam}
                    onClick={() =>
                        setSelectedSubjectId(subject.id)
                    }
                    >
                    <span
                        className={styles.subjectDot}
                        style={{
                        background: subject.color,
                        }}
                    />

                    <div>
                        <strong>
                        {exam.calendarName?.trim() ||
                            subject.name}
                        </strong>

                        <small>
                        {exam.type}
                        {exam.time
                            ? ` · ${exam.time}`
                            : ""}
                        </small>
                    </div>

                    <b>
                        {remaining === 0
                        ? "Today"
                        : `${remaining}d`}
                    </b>
                    </button>
                );
                })}

            {!upcomingExams.length && (
              <div className="empty-state">
                No exam dates yet.
              </div>
            )}
          </div>
        </section>
      </div>

      <section
        className={styles.subjectSelector}
      >
        <span className="eyebrow">
          SUBJECT
        </span>

        <div className={styles.subjectTabs}>
          {subjects.map((subject) => (
            <button
              key={subject.id}
              className={
                selectedSubject?.id ===
                subject.id
                  ? styles.activeSubject
                  : ""
              }
              onClick={() =>
                setSelectedSubjectId(
                  subject.id
                )
              }
            >
              <span
                className={styles.subjectDot}
                style={{
                  background: subject.color,
                }}
              />

              {subject.name}
            </button>
          ))}
        </div>
      </section>

      {selectedSubject && (
        <>
          <section
            className={`panel ${styles.examSettings}`}
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  EXAM DETAILS
                </span>

                <h3>
                  {selectedSubject.name}
                </h3>
                <button
                    className="primary-button"
                    onClick={() => addExam(selectedSubject.id)}
                    >
                    + Add exam
                </button>
              </div>
            </div>

            <div className={styles.examList}>
                {(examInfo[selectedSubject.id] ?? []).map(
                    (exam, index) => (
                    <div
                        key={exam.id}
                        className={styles.examEntry}
                    >
                        <div className={styles.examEntryHeader}>
                        <strong>
                            Exam {index + 1} · {exam.type}
                        </strong>

                        <button
                            className={styles.deleteButton}
                            onClick={() =>
                            deleteExam(
                                selectedSubject.id,
                                exam.id
                            )
                            }
                        >
                            ×
                        </button>
                        </div>

                        <div className={styles.detailGrid}>
                        <label>
                            Exam date

                            <input
                            type="date"
                            value={exam.date}
                            onChange={(event) =>
                                updateExam(
                                selectedSubject.id,
                                exam.id,
                                "date",
                                event.target.value
                                )
                            }
                            />
                        </label>

                        <label>
                            Time

                            <input
                            type="time"
                            value={exam.time}
                            onChange={(event) =>
                                updateExam(
                                selectedSubject.id,
                                exam.id,
                                "time",
                                event.target.value
                                )
                            }
                            />
                        </label>

                        <label>
                            Type

                            <select
                            value={exam.type}
                            onChange={(event) =>
                                updateExam(
                                selectedSubject.id,
                                exam.id,
                                "type",
                                event.target.value
                                )
                            }
                            >
                            <option>Quiz</option>
                            <option>Midterm</option>
                            <option>Final</option>
                            </select>
                        </label>

                        <label>
                            Room

                            <input
                            type="text"
                            placeholder="e.g. LH3-303"
                            value={exam.room}
                            onChange={(event) =>
                                updateExam(
                                selectedSubject.id,
                                exam.id,
                                "room",
                                event.target.value
                                )
                            }
                            />
                        </label>

                        <label className={styles.calendarLabel}>
                            Calendar label

                            <input
                            type="text"
                            placeholder="e.g. ProbStat Quiz"
                            value={exam.calendarName}
                            onChange={(event) =>
                                updateExam(
                                selectedSubject.id,
                                exam.id,
                                "calendarName",
                                event.target.value
                                )
                            }
                            />
                        </label>
                        </div>
                    </div>
                    )
                )}

  {(examInfo[selectedSubject.id] ?? []).length === 0 && (
    <div className="empty-state">
      No exams yet. Click + Add exam.
    </div>
  )}
</div>
          </section>

          <div className={styles.bottomGrid}>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">
                    PREPARATION
                  </span>

                  <h3>Study checklist</h3>
                </div>

                <strong>
                  {progress}%
                </strong>
              </div>

              <div
                className={styles.progress}
              >
                <i
                  style={{
                    width: `${progress}%`,
                  }}
                />
              </div>

              <form
                className={
                  styles.addChecklist
                }
                onSubmit={addChecklistItem}
              >
                <input
                  placeholder="Add topic, e.g. Binary Tree"
                  value={newChecklistItem}
                  onChange={(event) =>
                    setNewChecklistItem(
                      event.target.value
                    )
                  }
                />

                <button
                  className="primary-button"
                  type="submit"
                >
                  + Add
                </button>
              </form>

              <div
                className={styles.checklist}
              >
                {checklist.map((item) => (
                  <div
                    key={item.id}
                    className={
                      styles.checklistItem
                    }
                  >
                    <button
                      className={
                        item.done
                          ? styles.checked
                          : styles.checkbox
                      }
                      onClick={() =>
                        toggleChecklistItem(
                          item.id
                        )
                      }
                    >
                      {item.done ? "✓" : ""}
                    </button>

                    <span
                      className={
                        item.done
                          ? styles.doneText
                          : ""
                      }
                    >
                      {item.text}
                    </span>

                    <button
                      className={
                        styles.deleteButton
                      }
                      onClick={() =>
                        deleteChecklistItem(
                          item.id
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}

                {!checklist.length && (
                  <div className="empty-state">
                    Add the topics you need to
                    review.
                  </div>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">
                    COURSE MATERIALS
                  </span>

                  <h3>Files</h3>
                </div>

                <label
                  className="primary-button"
                >
                  + Upload

                  <input
                    hidden
                    multiple
                    type="file"
                    onChange={uploadFiles}
                  />
                </label>
              </div>

              <div className={styles.fileList}>
                {selectedFiles.map((file) => (
                  <div
                    key={file.id}
                    className={
                      styles.fileItem
                    }
                  >
                    <div
                      className={
                        styles.fileIcon
                      }
                    >
                      ▤
                    </div>

                    <div>
                      <strong>
                        {file.name}
                      </strong>

                      <small>
                        {formatFileSize(
                          file.size
                        )}
                      </small>
                    </div>

                    <button
                      className="secondary-button"
                      onClick={() =>
                        openFile(file)
                      }
                    >
                      Open
                    </button>

                    <button
                      className={
                        styles.deleteButton
                      }
                      onClick={() =>
                        deleteFile(file.id)
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}

                {!selectedFiles.length && (
                  <div className="empty-state">
                    Upload lecture slides,
                    notes, PDFs or exercises.
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

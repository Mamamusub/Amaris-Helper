"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import styles from "./exam.module.css";

type Subject = {
  id: string;
  code: string;
  name: string;
  examDate: string;
  examTime: string;
  room: string;
  type: "Midterm" | "Final" | "Quiz";
  topics: string[];
};

type ChecklistState = Record<string, Record<string, boolean>>;

type StoredFile = {
  id: string;
  subjectId: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  blob: Blob;
};

const SUBJECTS: Subject[] = [
  {
    id: "adt",
    code: "01204212",
    name: "Abstract Data Types",
    examDate: "2026-09-18",
    examTime: "09:00",
    room: "LH3-303",
    type: "Midterm",
    topics: [
      "Linked List",
      "Stack & Queue",
      "Binary Tree",
      "Binary Search Tree",
      "Tree Traversal",
    ],
  },
  {
    id: "discrete",
    code: "01418112",
    name: "Discrete Mathematics",
    examDate: "2026-09-24",
    examTime: "13:00",
    room: "LH4-201",
    type: "Midterm",
    topics: [
      "Set",
      "Relations",
      "Functions",
      "Counting",
      "Graph Theory",
    ],
  },
  {
    id: "computer-arch",
    code: "01204221",
    name: "Computer Architecture",
    examDate: "2026-10-03",
    examTime: "09:00",
    room: "Engineering Building",
    type: "Midterm",
    topics: [
      "Number System",
      "Logic Gates",
      "CPU",
      "Memory",
      "Assembly Basics",
    ],
  },
];

const DB_NAME = "amaris-exam";
const STORE_NAME = "subject-files";

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

async function getFiles(): Promise<StoredFile[]> {
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

async function saveFile(file: StoredFile) {
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

async function deleteStoredFile(id: string) {
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

function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseDate(date));
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getDaysLeft(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exam = parseDate(date);
  exam.setHours(0, 0, 0, 0);

  return Math.ceil(
    (exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export default function ExamPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [selectedSubjectId, setSelectedSubjectId] = useState(
    SUBJECTS[0].id
  );

  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [checklistLoaded, setChecklistLoaded] = useState(false);

  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);

  const selectedSubject =
    SUBJECTS.find((subject) => subject.id === selectedSubjectId) ??
    SUBJECTS[0];

  useEffect(() => {
    const savedChecklist = localStorage.getItem("amaris-exam-checklist");

    if (savedChecklist) {
      try {
        setChecklist(JSON.parse(savedChecklist));
      } catch {
        setChecklist({});
      }
    }

    setChecklistLoaded(true);

    getFiles()
      .then(setStoredFiles)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!checklistLoaded) return;

    localStorage.setItem(
      "amaris-exam-checklist",
      JSON.stringify(checklist)
    );
  }, [checklist, checklistLoaded]);

  const upcomingExams = useMemo(() => {
    return [...SUBJECTS]
      .filter((subject) => getDaysLeft(subject.examDate) >= 0)
      .sort(
        (a, b) =>
          parseDate(a.examDate).getTime() -
          parseDate(b.examDate).getTime()
      );
  }, []);

  const subjectFiles = storedFiles.filter(
    (file) => file.subjectId === selectedSubject.id
  );

  function toggleTopic(subjectId: string, topic: string) {
    setChecklist((current) => ({
      ...current,
      [subjectId]: {
        ...(current[subjectId] ?? {}),
        [topic]: !(current[subjectId]?.[topic] ?? false),
      },
    }));
  }

  function getProgress(subject: Subject) {
    const completed = subject.topics.filter(
      (topic) => checklist[subject.id]?.[topic]
    ).length;

    return Math.round((completed / subject.topics.length) * 100);
  }

  async function handleFileUpload(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(event.target.files ?? []);

    for (const file of files) {
      const storedFile: StoredFile = {
        id: crypto.randomUUID(),
        subjectId: selectedSubject.id,
        name: file.name,
        type: file.type,
        size: file.size,
        createdAt: new Date().toISOString(),
        blob: file,
      };

      await saveFile(storedFile);

      setStoredFiles((current) => [...current, storedFile]);
    }

    event.target.value = "";
  }

  async function removeFile(id: string) {
    await deleteStoredFile(id);

    setStoredFiles((current) =>
      current.filter((file) => file.id !== id)
    );
  }

  function openFile(file: StoredFile) {
    const url = URL.createObjectURL(file.blob);

    window.open(url, "_blank", "noopener,noreferrer");

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
  }

  function downloadFile(file: StoredFile) {
    const url = URL.createObjectURL(file.blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;

    anchor.click();

    URL.revokeObjectURL(url);
  }

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  while (calendarDays.length % 7 !== 0) {
    calendarDays.push(null);
  }

  function getDateKey(day: number) {
    const monthText = String(month + 1).padStart(2, "0");
    const dayText = String(day).padStart(2, "0");

    return `${year}-${monthText}-${dayText}`;
  }

  function previousMonth() {
    setCurrentMonth(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentMonth(new Date(year, month + 1, 1));
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>STUDY MANAGEMENT</p>
          <h1>Exam</h1>
          <p className={styles.subtitle}>
            Track exams, study progress and course resources.
          </p>
        </div>

        <div className={styles.examCount}>
          <strong>{upcomingExams.length}</strong>
          <span>Upcoming exams</span>
        </div>
      </div>

      <div className={styles.topGrid}>
        {/* CALENDAR */}

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardLabel}>CALENDAR</p>

              <h2>
                {currentMonth.toLocaleString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
            </div>

            <div className={styles.calendarControls}>
              <button onClick={previousMonth}>←</button>
              <button
                onClick={() => setCurrentMonth(new Date())}
              >
                Today
              </button>
              <button onClick={nextMonth}>→</button>
            </div>
          </div>

          <div className={styles.weekRow}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (day) => (
                <span key={day}>{day}</span>
              )
            )}
          </div>

          <div className={styles.calendar}>
            {calendarDays.map((day, index) => {
              if (!day) {
                return (
                  <div
                    className={styles.emptyDay}
                    key={`empty-${index}`}
                  />
                );
              }

              const dateKey = getDateKey(day);

              const exams = SUBJECTS.filter(
                (subject) => subject.examDate === dateKey
              );

              const today = new Date();

              const isToday =
                day === today.getDate() &&
                month === today.getMonth() &&
                year === today.getFullYear();

              return (
                <div
                  key={dateKey}
                  className={`${styles.calendarDay} ${
                    isToday ? styles.today : ""
                  }`}
                >
                  <span>{day}</span>

                  {exams.map((exam) => (
                    <button
                      key={exam.id}
                      className={styles.examEvent}
                      onClick={() =>
                        setSelectedSubjectId(exam.id)
                      }
                    >
                      {exam.code}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </section>

        {/* UPCOMING */}

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardLabel}>NEXT</p>
              <h2>Upcoming Exams</h2>
            </div>
          </div>

          <div className={styles.upcomingList}>
            {upcomingExams.map((exam) => {
              const daysLeft = getDaysLeft(exam.examDate);

              return (
                <button
                  key={exam.id}
                  className={styles.upcomingExam}
                  onClick={() =>
                    setSelectedSubjectId(exam.id)
                  }
                >
                  <div className={styles.examDateBox}>
                    <strong>
                      {parseDate(exam.examDate).getDate()}
                    </strong>

                    <span>
                      {parseDate(exam.examDate).toLocaleString(
                        "en-US",
                        {
                          month: "short",
                        }
                      )}
                    </span>
                  </div>

                  <div className={styles.examInfo}>
                    <strong>{exam.name}</strong>

                    <span>
                      {exam.type} · {exam.examTime}
                    </span>

                    <span>{exam.room}</span>
                  </div>

                  <div className={styles.daysLeft}>
                    {daysLeft === 0
                      ? "Today"
                      : `${daysLeft}d`}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* SUBJECT SELECTOR */}

      <section className={styles.subjectSection}>
        <p className={styles.cardLabel}>SUBJECT</p>

        <div className={styles.subjectTabs}>
          {SUBJECTS.map((subject) => (
            <button
              key={subject.id}
              onClick={() =>
                setSelectedSubjectId(subject.id)
              }
              className={
                selectedSubjectId === subject.id
                  ? styles.activeSubject
                  : ""
              }
            >
              <span>{subject.code}</span>
              {subject.name}
            </button>
          ))}
        </div>
      </section>

      <div className={styles.bottomGrid}>
        {/* CHECKLIST */}

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardLabel}>PREPARATION</p>
              <h2>Study Checklist</h2>
            </div>

            <strong className={styles.progressNumber}>
              {getProgress(selectedSubject)}%
            </strong>
          </div>

          <div className={styles.progressTrack}>
            <div
              className={styles.progressBar}
              style={{
                width: `${getProgress(selectedSubject)}%`,
              }}
            />
          </div>

          <div className={styles.checklist}>
            {selectedSubject.topics.map((topic) => {
              const checked =
                checklist[selectedSubject.id]?.[topic] ??
                false;

              return (
                <label
                  key={topic}
                  className={`${styles.checkItem} ${
                    checked ? styles.completed : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      toggleTopic(
                        selectedSubject.id,
                        topic
                      )
                    }
                  />

                  <span>{topic}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* FILE STORAGE */}

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardLabel}>RESOURCES</p>
              <h2>Course Files</h2>
            </div>

            <label className={styles.uploadButton}>
              + Upload

              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                hidden
              />
            </label>
          </div>

          <div className={styles.fileArea}>
            {subjectFiles.length === 0 ? (
              <div className={styles.emptyFiles}>
                <div>📁</div>

                <strong>No files yet</strong>

                <span>
                  Upload lecture slides, PDF, notes or
                  exercises.
                </span>
              </div>
            ) : (
              subjectFiles.map((file) => (
                <div
                  key={file.id}
                  className={styles.fileItem}
                >
                  <div className={styles.fileIcon}>
                    📄
                  </div>

                  <div className={styles.fileInfo}>
                    <strong>{file.name}</strong>

                    <span>
                      {formatSize(file.size)}
                    </span>
                  </div>

                  <div className={styles.fileActions}>
                    <button
                      onClick={() => openFile(file)}
                    >
                      Open
                    </button>

                    <button
                      onClick={() =>
                        downloadFile(file)
                      }
                    >
                      ↓
                    </button>

                    <button
                      className={styles.deleteButton}
                      onClick={() =>
                        removeFile(file.id)
                      }
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className={styles.examDetails}>
        <span>
          Next exam:
          <strong> {selectedSubject.name}</strong>
        </span>

        <span>{formatDate(selectedSubject.examDate)}</span>

        <span>{selectedSubject.examTime}</span>

        <span>{selectedSubject.room}</span>
      </div>
    </main>
  );
}
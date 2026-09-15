"use client";

import AccountBoundary from "@/components/account-boundary";
import { ExamDashboard } from "@/components/exam-hub";

export default function ExamPage() {
  return <AccountBoundary><ExamDashboard /></AccountBoundary>;
}

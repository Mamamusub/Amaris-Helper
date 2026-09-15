"use client";

import { use } from "react";
import AccountBoundary from "@/components/account-boundary";
import { ExamDetail } from "@/components/exam-hub";

export default function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <AccountBoundary><ExamDetail routeId={decodeURIComponent(use(params).id)} /></AccountBoundary>;
}

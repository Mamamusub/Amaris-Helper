"use client";
import { use } from 'react';
import AccountBoundary from '@/components/account-boundary';
import BuildLab from '@/components/build-lab';
export default function ProjectPage({params}:{params:Promise<{id:string}>}) { const {id}=use(params); return <AccountBoundary><BuildLab projectId={id}/></AccountBoundary>; }

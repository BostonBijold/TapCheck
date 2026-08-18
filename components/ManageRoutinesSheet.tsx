"use client";

import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";

interface Group {
  _id: string;
  name: string;
}

interface Props {
  groups: Group[];
  onClose: () => void;
}

export default function ManageRoutinesSheet({ groups, onClose }: Props) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-mobile bg-card rounded-t-[16px]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Title */}
        <div className="px-5 pt-3 pb-4">
          <h2 className="font-heading text-xl text-text">Manage Routines</h2>
        </div>

        {/* Group list */}
        <div className="divide-y divide-border border-t border-border">
          {groups.map((group) => (
            <Link
              key={group._id}
              href={`/routines/${group._id}/edit`}
              onClick={onClose}
              className="flex items-center justify-between px-5 min-h-[52px] hover:bg-card-hover active:bg-card-hover transition-colors"
            >
              <span className="font-body text-sm text-text">{group.name}</span>
              <ChevronRight size={16} strokeWidth={1.75} className="text-dim flex-shrink-0" />
            </Link>
          ))}

          <Link
            href="/routines/new"
            onClick={onClose}
            className="flex items-center gap-2 px-5 min-h-[52px] hover:bg-card-hover active:bg-card-hover transition-colors"
          >
            <Plus size={15} strokeWidth={1.75} className="text-olive" />
            <span className="font-body text-sm text-olive">Add New Routine</span>
          </Link>
        </div>

        {/* Safe area spacer */}
        <div className="h-6" />
      </div>
    </>
  );
}

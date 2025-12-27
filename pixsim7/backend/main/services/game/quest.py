"""
Quest/Arc service for managing quest state and progression.

Quests are stored in GameSession.flags under the 'quests' namespace.
Format: flags['quests'][quest_id] = { status, objectives[], metadata }
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel

class QuestObjective(BaseModel):
    """A single objective within a quest"""
    id: str
    description: str
    completed: bool = False
    progress: int = 0
    target: int = 1
    optional: bool = False


class Quest(BaseModel):
    """Quest data structure"""
    id: str
    title: str
    description: str
    status: str = "active"  # active, completed, failed, hidden
    objectives: List[QuestObjective] = []
    metadata: Dict[str, Any] = {}


class QuestService:
    """Service for managing quests in game sessions"""

    @staticmethod
    def get_quest(session_flags: Dict[str, Any], quest_id: str) -> Optional[Quest]:
        """Get a specific quest from session flags"""
        quests = session_flags.get("quests", {})
        if quest_id not in quests:
            return None

        quest_data = quests[quest_id]
        return Quest(**quest_data)

    @staticmethod
    def list_quests(session_flags: Dict[str, Any], status_filter: Optional[str] = None) -> List[Quest]:
        """List all quests, optionally filtered by status"""
        quests = session_flags.get("quests", {})
        quest_list = []

        for quest_id, quest_data in quests.items():
            quest = Quest(**quest_data)
            if status_filter is None or quest.status == status_filter:
                quest_list.append(quest)

        return quest_list

    @staticmethod
    def add_quest(
        session_flags: Dict[str, Any],
        quest_id: str,
        title: str,
        description: str,
        objectives: List[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Add a new quest to session flags"""
        if "quests" not in session_flags:
            session_flags["quests"] = {}

        objectives_list = [QuestObjective(**obj) for obj in objectives]

        quest = Quest(
            id=quest_id,
            title=title,
            description=description,
            status="active",
            objectives=objectives_list,
            metadata=metadata or {}
        )

        session_flags["quests"][quest_id] = quest.dict()
        return session_flags

    @staticmethod
    def update_quest_status(
        session_flags: Dict[str, Any],
        quest_id: str,
        status: str
    ) -> Dict[str, Any]:
        """Update quest status"""
        if "quests" not in session_flags or quest_id not in session_flags["quests"]:
            raise ValueError(f"Quest {quest_id} not found")

        session_flags["quests"][quest_id]["status"] = status
        return session_flags

    @staticmethod
    def update_objective_progress(
        session_flags: Dict[str, Any],
        quest_id: str,
        objective_id: str,
        progress: int,
        completed: Optional[bool] = None
    ) -> Dict[str, Any]:
        """Update objective progress and completion status"""
        if "quests" not in session_flags or quest_id not in session_flags["quests"]:
            raise ValueError(f"Quest {quest_id} not found")

        quest_data = session_flags["quests"][quest_id]

        for obj in quest_data.get("objectives", []):
            if obj["id"] == objective_id:
                obj["progress"] = progress
                if completed is not None:
                    obj["completed"] = completed
                elif progress >= obj.get("target", 1):
                    obj["completed"] = True
                break

        # Check if all objectives are complete
        objectives = quest_data.get("objectives", [])
        required_objectives = [obj for obj in objectives if not obj.get("optional", False)]
        all_complete = all(obj["completed"] for obj in required_objectives)

        if all_complete and quest_data["status"] == "active":
            quest_data["status"] = "completed"

        return session_flags

    @staticmethod
    def complete_objective(
        session_flags: Dict[str, Any],
        quest_id: str,
        objective_id: str
    ) -> Dict[str, Any]:
        """Mark an objective as completed"""
        return QuestService.update_objective_progress(
            session_flags,
            quest_id,
            objective_id,
            progress=1,
            completed=True
        )

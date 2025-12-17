from fastapi import APIRouter, Request, Depends
from db.cerebras_client import get_cerebras_client
from db.supabase_client import get_supabase_client
from db.auth_dependency import get_current_user
from cerebras.cloud.sdk import Cerebras
from supabase import Client
from models.todo import Todo
from models.user import User
from config import settings

router = APIRouter(prefix="/chat", tags=["Chat"])

@router.post("/todo-suggestions")
async def get_todo_suggestions(
    request: Request,
    cerebras_client: Cerebras = Depends(get_cerebras_client),
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
):
    body = await request.json()
    prompt = body.get("content", "")
    categories = (
        supabase.table("categories")
        .select("*")
        .eq("user_id", str(user.id))
        .execute()
    )
    categories_context = ""
    if categories.data:
        categories_list = [f"- {cat['name']} (id: {cat['id']})" for cat in categories.data]
        categories_context = f"\n\nAvailable categories:\n" + "\n".join(categories_list) + "\n\nWhen creating a todo item, choose the most appropriate category based on the user's input. Set the category_id field to the matching category's id, and category_name to the category's name. If no category matches, you can leave category_id and category_name as null."
    else:
        categories_context = "\n\nNo categories are available. Leave category_id and category_name as null when creating todo items."
    todo_json = Todo.model_json_schema()
    todos_array_schema = {
        "type": "array",
        "items": todo_json,
        "minItems": 1
    }
    system_prompt = (
        "You are a helpful assistant that generates todo items based on user input. "
        "Extract or create structured todo items from the user's message. "
        "You MUST return an array of todo items - if the user mentions multiple tasks, create a separate todo item for each one. "
        "Only focus on taking the input given by the user, and creating actionable items based on the user input. "
        "If the user gives you input that cannot be broken down into action items, please respond to the user with 'I cannot help you with this.' "
        "You can make multiple to dos based on the user input. Each to do should be a separate item in the array. "
        "Don't try to force action items based on the user input. The list of categories that a to do can be in is below. Please do not make up any categories, and make sure each to do is not too long. "
        "Default category should be inbox if you can't find a suitable category."
        "Here are the categories you can choose from: " + categories_context
    )
    completion = cerebras_client.chat.completions.create(
        model = settings.CEREBRAS_MODEL, 
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        response_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "todos_array",
                "schema": todos_array_schema
            }
        }
    )
    return completion.choices[0].message.content
    
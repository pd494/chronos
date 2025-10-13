from fastapi import (
    APIRouter,
    HTTPException,
    Depends,
    status
)
from fastapi.responses import JSONResponse
from db.supabase_client import get_supabase_client
from db.auth_dependency import get_current_user
from supabase import Client
from models.user import User
from models.todo import CategoryUpdate, Todo, Category
from uuid import UUID
from models.todo import TodoUpdate

router = APIRouter(prefix="/todos", tags=["Todos"])


@router.post("/")
async def create_todo(
    todo: Todo,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    todo_data = todo.model_dump(exclude={"id"}, mode="json")
    print(f"Todo data: {todo_data}")
    todo_data["user_id"] = str(user.id)
    category_result = (
        supabase.table("categories")
        .select("id")
        .eq("user_id", str(user.id))
        .eq("name", todo.category_name)
        .execute()
    )
    if not category_result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category not found"
        )
    todo_data["category_id"] = category_result.data[0]["id"]
    result = supabase.table("todos").insert(todo_data).execute()
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create todo"
        )
    
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "message": "Todo created successfully",
            "data": result.data[0]
        },
    )

@router.get("/")
async def get_todos(
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    result = (
        supabase.table("todos")
        .select("*")
        .eq("user_id", str(user.id))
        .execute()
    )
    if not result.data:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "message": "No todos found",
                "data": []
            }
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Todos fetched successfully",
            "data": result.data
        },
    )

@router.put("/{todo_id}")
async def edit_todo(
    todo_id: UUID,
    todo_update: TodoUpdate,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    updates = todo_update.model_dump(exclude_unset=True, exclude_none=True)
    
    if "category_id" in updates and updates["category_id"] is not None:
        updates["category_id"] = str(updates["category_id"])
    
    result = (
        supabase.table("todos")
        .update(updates)
        .eq("id", str(todo_id))
        .eq("user_id", str(user.id))
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update todo"
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Todo updated successfully",
            "data": result.data[0],
        },
    )
    
    
@router.patch("/{todo_id}/complete")
async def complete(
    todo_id: str,
    is_completed: bool = False,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    
    result = (
        supabase.table("todos")
        .update({"completed": is_completed})
        .eq("id", todo_id)
        .eq("user_id", str(user.id))
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo not found or access denied"
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Todo updated successfully",
            "data": result.data[0]
        }
    )


@router.delete("/{todo_id}")
async def delete_todo(
    todo_id: str,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    result = (
        supabase.table("todos")
        .delete()
        .eq("id", todo_id)
        .eq("user_id", str(user.id))
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo not found or is not yours"
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Todo deleted successfully"
        }
    )


# --------- CATEGORIES ENDPOINTS --------------

@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    todos_result = (
        supabase.table("todos")
        .delete()
        .eq("category_id", category_id)
        .eq("user_id", str(user.id))
        .execute()
    )
    result = (
        supabase.table("categories")
        .delete()
        .eq("id", category_id)
        .eq("user_id", str(user.id))
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found or is not yours"
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Category and associated todos deleted successfully"
        }
    )
@router.post("/categories/")
async def create_category(
    category: Category, 
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse: 
    
    existing =  (
        supabase.table("categories")
        .select("*")
        .eq("user_id", str(user.id))
        .eq("name", category.name)
        .execute()
    )
    
    if existing.data:
        raise HTTPException(
            status_code = status.HTTP_400_BAD_REQUEST,
            detail = "Category already exists"
        )
    category_data = category.model_dump(mode = "json") 
    category_data["user_id"] = str(user.id)
    result = supabase.table("categories").insert(category_data).execute()
    if not result.data:
        raise HTTPException(status_code = status.HTTP_400_BAD_REQUEST, 
                            detail = "Unable to create category")
    return JSONResponse(
        status_code = status.HTTP_201_CREATED,
        content = {
            "message": "Category created successfully",
            "data": Category(**result.data[0]).model_dump(mode="json"),
        }
    )

@router.get("/categories/")
async def get_categories(
    supabase: Client = Depends(get_supabase_client),   
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    result = (
        supabase.table("categories")
        .select("*")
        .eq("user_id", str(user.id))
        .execute()
    )
    if not result.data:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "message": "No categories found",
                "data": []
            }
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Categories fetched successfully",
            "data": result.data
        },
    )

@router.patch("/categories/{category_id}")
async def update_category(
    category_id: str,
    category_update: CategoryUpdate,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    updates = category_update.model_dump(exclude_unset=True, exclude_none=True)
    result = (
        supabase.table("categories")
        .update(updates)
        .eq("id", category_id)
        .eq("user_id", user.id)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update category"
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Category updated successfully",
            "data": result.data[0]
        }
    )
    
@router.patch("/categories/{category_id}/assign-todo/{todo_id}")
async def assign_todo_to_category(
    category_id: str,
    todo_id: str,
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
) -> JSONResponse:
    
    result = (
        supabase.table("todos")
        .update({"category_id": category_id})
        .eq("id", todo_id)
        .eq("user_id", user.id)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to assign todo to category"
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "message": "Todo assigned to category successfully",
            "data": result.data[0]
        }
    )

    


    
    

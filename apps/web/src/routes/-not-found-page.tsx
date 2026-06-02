import { Link } from "@tanstack/react-router"

export function NotFoundPage() {
  return (
    <div className="not-found">
      <h1>Page Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <Link to="/">Go home</Link>
    </div>
  )
}

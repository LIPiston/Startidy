// GitHub API Types

export interface Repo {
  id: number;
  name: string;
  owner: { login: string; id: number };
  description: string;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  private: boolean;
}

export default function getRepoUrl(rawghurl: string) {
    const url = new URL(rawghurl);
    const pathName = url.pathname.split("/").filter(Boolean);
    const [owner, repo] = pathName!;
    return {
        repo: owner + "/" + repo,
        url: `https://github.com/${owner}/${repo}`
    }
}
type RepoData = {
    id: number;
    name: string;
    repo: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    pushedAt: string;
    stars: number;
    watchers: number;
    forks: number;
    defaultBranch: string;
}

export function getRepoData(repo: string): Promise<RepoData> {
    const url = "https://ungh.cc/" + repo;
    return fetch(url).then(res => res.json()) as Promise<RepoData>;
}
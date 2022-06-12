const LOWERCASE_REGEX = /^[a-z0-9]+$/

export const isLowercase = (s: string) => LOWERCASE_REGEX.test(s)

export const getLocationAttribute = (filePath: string, line: number, column: number): string =>
	filePath + ":" + line + ":" + column

export function getFileExtension(filename: string): string {
	const index = filename.lastIndexOf(".")
	return index < 0 ? "" : filename.substring(index)
}
export function isFileJSX(filename: string): boolean {
	const ext = getFileExtension(filename)
	return ext === ".jsx" || ext === ".tsx"
}

import axios from 'axios'
import fs from 'fs'
import AdmZip from 'adm-zip'
import path from 'path'
import dotenv from 'dotenv';

// load env vars
dotenv.config()
const baseUrl = process.env.BLACKBOARD_API_BASE_URL
const courseId = process.env.COURSE_ID
const cookie = process.env.SESSION_COOKIE
const rootDestinationDir = process.env.DESTINATION_DIR

async function main() {
    // get list of all students in the course
    const studentsInCourse = await getStudentsInCourse()

    // get information about each students in course
    const studentsData = await Promise.all(studentsInCourse.map(async student => {
        const studentData = await getUserData(student.userId)
        return {
            id: student.userId,
            username: studentData.userName,
            firstName: studentData.name.given,
            lastName: studentData.name.family
        }
    }))

    // maps student id to their data to allow for quick lookup
    const studentMap = studentsData.reduce((acc, curr) => {
        acc[curr.id] = curr
        return acc
    }, {})

    // get all assignments
    const columns = await getColumns()
    columns.forEach(async column => {
        // get all submissions for an assignment 
        const columnAttempts = await getUngradedColumnAttempts(column.id)

        // keeps track of the submission count for a student
        // this is used to differentiate between multiple attempts for the same student
        const studentSubmissionNumberTracker = {}

        columnAttempts.forEach(async attempt => {
            // get list of files in a submission
            const assignmentSubmissionFiles = await getAssignmentSubmissionFileList(attempt.id)
            assignmentSubmissionFiles.forEach(async file => {
                // download a file from the submission to computer at specified output path
                const student = studentMap[attempt.userId]

                // determine attempt number
                // if student submitted multiple attempts for an assignment, the most recent attempt will be the highest number
                if (studentSubmissionNumberTracker[student.id]) {
                    studentSubmissionNumberTracker[student.id]++;
                }
                else {
                    studentSubmissionNumberTracker[student.id] = 1
                }
                const attemptNumber = studentSubmissionNumberTracker[student.id]

                // download file to output path
                const outputPath = sanitizePath(`${column.name}/${student.username}_${student.firstName}_${student.lastName}/attempt_${attemptNumber}`)
                createDirectoriesInPathIfNotExist(`${rootDestinationDir}/${outputPath}`)
                await downloadAssignmentSubmissionFile(attempt.id, file.id, `${rootDestinationDir}/${outputPath}/${file.name}`)
            })
        })
    })
}

// get data for a user on Blackboard
async function getUserData(userId) {
    try {
        const userResponse = await axios.get(`${baseUrl}/users/${userId}`, { headers: { Cookie: cookie }})
        return userResponse.data
    }
    catch(err) {
        console.error(err)
        console.error(`Failed to get user ${userId} data: ${err.message}`)
        throw err
    }
}

// get all students in the course
async function getStudentsInCourse() {
    try {
        const usersInCourseResponse = await axios.get(`${baseUrl}/courses/${courseId}/users`, { headers: { Cookie: cookie }})
        return usersInCourseResponse.data.results.filter(user => user.courseRoleId === 'Student')
    }
    catch(err) {
        console.error(err)
        console.error(`Failed to get students in course ${courseId}: ${err.message}`)
        throw err
    }
}

// get all columns in the course
// note: columns are "grading columns" from the gradebook
// each column lines up with an assignment
async function getColumns() {
    try {
        const columnResponse = await axios.get(`${baseUrl}/courses/${courseId}/gradebook/columns`, { headers: { Cookie: cookie }})
        return columnResponse.data.results
    }
    catch(err) {
        console.error(err)
        console.error(`Failed to get column data: ${err.message}`)
        throw err
    }
}

// get all ungraded assignment submission attempts for a particular assignment
// sort by date submitted to make it easier to parse situations where a student has submitted multiple attempts for an assignment (ordered earliest -> latest)
async function getUngradedColumnAttempts(columnId) {
    try {
        const columnAttemptsResponse = await axios.get(`${baseUrl}/courses/${courseId}/gradebook/columns/${columnId}/attempts`, { headers: { Cookie: cookie }})
        return columnAttemptsResponse.data.results
            .filter(attempt => attempt.status === 'NeedsGrading')
            .sort((a, b) => new Date(a.created) - new Date(b.created))
    }
    catch(err) {
        console.error(err)
        console.error(`Failed to get ungraded column ${columnId} attempts data: ${err.message}`)
        throw err
    }
}

// get the names of all files that are included in a submission attempt
async function getAssignmentSubmissionFileList(attemptId) {
    try {
        const attemptFilesListResponse = await axios.get(`${baseUrl}/courses/${courseId}/gradebook/attempts/${attemptId}/files`, { headers: { Cookie: cookie }})
        return attemptFilesListResponse.data.results
    }
    catch(err) {
        console.error(err)
        console.error(`Failed to get assignment submission file list data for attempt ${attemptId}: ${err.message}`)
        throw err
    }
}

// download a file from blackboard and save it to computer at specified path
// this will also automatically unzip any zip files that get downloaded
async function downloadAssignmentSubmissionFile(attemptId, fileId, destinationPath) {
    try {
        // download file from blackboard
        const attemptFileSteamResponse = await axios.get(`${baseUrl}/courses/${courseId}/gradebook/attempts/${attemptId}/files/${fileId}/download`, { responseType: 'stream', headers: { Cookie: cookie }})
        
        // create file stream writer
        const fileWriter = fs.createWriteStream(destinationPath)

        // pipe downloaded file response to file stream writer
        attemptFileSteamResponse.data.pipe(fileWriter)

        return new Promise((resolve, reject) => {

            // this is called when the file was successfully finished writing
            fileWriter.on('finish', () => {
                // if zip file, unzip it
                if (destinationPath.endsWith('.zip')) {
                    unzipFile(destinationPath)
                }
                resolve('successfully saved file!')
            });

            fileWriter.on('error', (error) => {
                console.error(error)
                console.error(`Failed to write file to ${outputPath}: ${error.message}`)
                reject(error)
            });
        })
    }
    catch(err) {
        console.error(err)
        console.error(`Failed to download file ${fileId} for attempt ${attemptId}: ${err.message}`)
        throw err
    }
}

// takes a path, creates all folders in the path that don't exist ("fills in" missing parts of the path)
function createDirectoriesInPathIfNotExist(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }
    catch(err) {
        console.error(err)
        console.error(`Failed to create directory path ${dirPath}: ${err.message}`)
    }
}

// unzips a zip file
function unzipFile(zipFilePath) {
    try {
        // using this random library "AdmZip" to unzip a file
        const zip = new AdmZip(zipFilePath)

        // unzip file to the same location as zip file is in (it will create a new folder with the name of the zip file and extract all contents to it)
        zip.extractAllTo(path.dirname(zipFilePath))
    }
    catch(err) {
        console.error(err)
        console.error(`Unable to unzip file ${zipFilePath}: ${err.message}`)
    }
}

// because windows can't have certain characters in a file path, this is used to get rid of them
function sanitizePath(dirPath) {
    const invalidChars = /[<>:"|?*\x00-\x1F]/g;
    // replace invalid characters with an underscore
    return dirPath.replace(invalidChars, '_');
}

main()
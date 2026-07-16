import { NextResponse } from "next/server";

export async function GET() {
	return NextResponse.json({
		deck: {
			id: "demo-deck",
			title: "Algebra Skills Battle",
			course_name: "High School Algebra",
		},
		questions: [
			{
				id: "demo-q1",
				question_text: "Solve for x: 3x + 7 = 22",
				answer_choices: ["x = 3", "x = 5", "x = 7", "x = 9"],
				correct_answer: "x = 5",
				explanation:
					"Subtract 7 from both sides to get 3x = 15, then divide by 3.",
				topic: "Linear equations",
				difficulty: "easy",
			},
			{
				id: "demo-q2",
				question_text: "What is the slope of the line y = 4x - 1?",
				answer_choices: ["-1", "0", "4", "1/4"],
				correct_answer: "4",
				explanation: "In y = mx + b, the slope is m.",
				topic: "Slope",
				difficulty: "easy",
			},
		],
	});
}
